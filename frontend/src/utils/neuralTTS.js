// Neural TTS - 微软神经语音（晓晓）
// 优先调用后端 API（/api/v1/tts/speak，密钥仅存于服务端 edge-tts 库内部，不进仓库），
// 失败则回退到浏览器内置 Web Speech API（所有浏览器可用，无需任何 token）。
//
// 后端 /api/v1/tts/speak 需要登录（每次请求会 fork 一个 edge-tts 子进程，成本很高），
// 所以这里不能像其它接口那样走 api/client.js 的裸 fetch，必须手动带上 JWT。
// 注：原先的浏览器直连微软 Edge TTS WebSocket 方案硬编码了一个逆向得到的 TrustedClientToken，
// 提交到公开仓库有合规风险，已移除，统一走后端代理。

import useAuthStore from '../store/authStore';

var TTS_API_URL = '/api/v1/tts/speak';

var EXPR_PROSODY = {
  neutral:   { rate: '+30%', pitch: '+0Hz',  volume: '+0%' },
  calm:      { rate: '+18%', pitch: '-3Hz',  volume: '-5%' },
  happy:     { rate: '+45%', pitch: '+8Hz',  volume: '+5%' },
  alert:     { rate: '+50%', pitch: '+5Hz',  volume: '+10%' },
  thinking:  { rate: '+10%', pitch: '-8Hz',  volume: '-5%' },
  focus:     { rate: '+18%', pitch: '-4Hz',  volume: '+0%' },
  approve:   { rate: '+35%', pitch: '+5Hz',  volume: '+5%' },
  surprised: { rate: '+55%', pitch: '+15Hz', volume: '+10%' },
  worried:   { rate: '+15%', pitch: '-6Hz',  volume: '-8%' }
};

var DEFAULT_VOICE = 'zh-CN-XiaoxiaoNeural';

/**
 * 通过后端 API 获取语音（最稳定）
 */
function _speakViaBackend(text, voice, rate, pitch, volume, expression) {
  // 后端 TTS 已加鉴权，必须带上 JWT，否则 401 会直接降级到浏览器语音
  var token = (useAuthStore && useAuthStore.getState && useAuthStore.getState().token) || '';
  var headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;

  return fetch(TTS_API_URL, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({ text, voice, rate, pitch, volume, expression }),
  }).then(function(resp) {
    if (!resp.ok) throw new Error('Backend TTS failed: ' + resp.status);
    return resp.blob();
  }).then(function(blob) {
    if (blob.size < 100) throw new Error('Backend TTS returned empty audio');
    return URL.createObjectURL(blob);
  });
}

/**
 * Web Speech API 兜底（最后一级降级，所有浏览器都能用）
 * 返回一个伪 audio 元素的 Promise，接口与上面保持一致（play/pause）
 * 用 Blob URL 的方式不现实，所以直接返回一个可 play 的对象包装
 */
function _speakViaWebSpeech(text, voice, rate, pitch, volume) {
  return new Promise(function(resolve, reject) {
    if (!window.speechSynthesis) {
      reject(new Error('Web Speech API not available'));
      return;
    }
    var utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'zh-CN';
    utter.rate = 1.0;
    // rate 是 "+18%" 这种格式，转成数字
    var rateMatch = (rate || '').match(/([+-]?\d+)%/);
    if (rateMatch) utter.rate = 1 + parseInt(rateMatch[1], 10) / 100;
    utter.rate = Math.max(0.5, Math.min(2, utter.rate));

    var pitchMatch = (pitch || '').match(/([+-]?\d+)Hz/);
    if (pitchMatch) utter.pitch = 1 + parseInt(pitchMatch[1], 10) / 20;
    utter.pitch = Math.max(0, Math.min(2, utter.pitch || 1));

    var volMatch = (volume || '').match(/([+-]?\d+)%/);
    if (volMatch) utter.volume = 1 + parseInt(volMatch[1], 10) / 100;
    utter.volume = Math.max(0, Math.min(1, utter.volume || 1));

    // 找中文语音
    var voices = window.speechSynthesis.getVoices();
    var zhVoice = voices.find(function(v) {
      return v.lang && v.lang.toLowerCase().indexOf('zh') === 0;
    });
    if (zhVoice) utter.voice = zhVoice;

    // 为了和神经语音接口兼容，我们不直接播放，而是返回一个"可播放对象"
    // 但 Web Speech API 只能直接说，所以借用 Audio 接口做包装：
    // 创建一个极短的静音 audio，然后在它 play 时触发 speechSynthesis.speak
    // 更简单的做法：直接返回一个 { play, pause, src } 的兼容对象
    var spoken = false;
    var fakeAudio = {
      play: function() {
        if (spoken) return Promise.resolve();
        spoken = true;
        window.speechSynthesis.speak(utter);
        return new Promise(function(res) {
          utter.onend = function() { res(); };
          utter.onerror = function() { res(); };
        });
      },
      pause: function() {
        window.speechSynthesis.cancel();
      },
      // 加一个标记，让调用方能识别这是 Web Speech 模式
      _isWebSpeech: true,
      src: 'webspeech://' + text.slice(0, 20),
    };
    // 用一个 data: URI 的静音音频做占位，让调用方的 Audio 构造不会报错
    // 实际上调用方如果检测到 _isWebSpeech 就直接用 play/pause 方法
    resolve('webspeech:' + encodeURIComponent(text));
  });
}

/**
 * 生成神经语音，返回音频 URL（或 webspeech: 前缀表示走浏览器语音）
 * 优先级：后端 API > WebSocket 直连 > Web Speech API（兜底）
 *
 * 返回值约定：
 *   - blob:http://... → 神经语音，new Audio(url) 即可播放
 *   - webspeech:... → 走浏览器 Web Speech API，需调用方特殊处理（直接 speak）
 *
 * 为什么不在这一层直接播？因为上层（DigitalHumanStage / FloatingCompanion）
 * 需要统一管理 audioRef 的暂停/取消，接口保持 URL 形式最省事。
 * Web Speech 的情况上层会检测前缀并走特殊分支。
 */
export function neuralSpeak(text, expression, opts) {
  expression = expression || 'neutral';
  opts = opts || {};
  var prosody = EXPR_PROSODY[expression] || EXPR_PROSODY.neutral;
  var voice = opts.voice || DEFAULT_VOICE;
  var rate = opts.rate || prosody.rate;
  var pitch = opts.pitch || prosody.pitch;
  var volume = opts.volume || prosody.volume;

  // 1. 后端 API → 2. Web Speech API（浏览器内置，无需 token，无合规风险）
  return _speakViaBackend(text, voice, rate, pitch, volume, expression)
    .catch(function(err) {
      console.warn('[TTS] backend failed, fallback to Web Speech API:', err.message);
      return _speakViaWebSpeech(text, voice, rate, pitch, volume);
    });
}

var PAUSE_MAP = { '1': 280, '2': 300, '3': 320, '4': 180, '5': 140, '6': 220, '7': 160 };

export function splitSentences(text) {
  var result = [];
  var buf = '';
  var PUNCT = {
    '\u3002': 280, // 。
    '\uff01': 300, // ！
    '\uff1f': 320, // ？
    '\uff0c': 180, // ，
    '\u3001': 140, // 、
    '\uff1b': 220, // ；
    '\uff1a': 160  // ：
  };
  for (var i = 0; i < text.length; i++) {
    var ch = text.charAt(i);
    buf += ch;
    if (PUNCT[ch]) {
      result.push({ text: buf.trim(), pause: PUNCT[ch] });
      buf = '';
    }
  }
  if (buf.trim()) result.push({ text: buf.trim(), pause: 200 });
  return result;
}
