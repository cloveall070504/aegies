// Neural TTS - 微软神经语音（晓晓）
// 优先调用后端 API（/api/v1/tts/speak，密钥仅存于服务端 edge-tts 库内部，不进仓库），
// 失败则回退到浏览器内置 Web Speech API（所有浏览器可用，无需任何 token）。
//
// 后端 /api/v1/tts/speak 需要登录（每次请求会 fork 一个 edge-tts 子进程，成本很高），
// 所以这里不能像其它接口那样走 api/client.js 的裸 fetch，必须手动带上 JWT。
// 注：原先的浏览器直连微软 Edge TTS WebSocket 方案硬编码了一个逆向得到的 TrustedClientToken，
// 提交到公开仓库有合规风险，已移除，统一走后端代理。

import useAuthStore from '../store/authStore';
import { trackTTS } from './telemetry';

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
 * 取某表情对应的"基础语速百分比数字"（如 '+30%' → 30），供 speechController
 * 在用户/状态偏好倍率下重新缩放后透传给后端 TTS。
 */
export function baseRatePct(expression) {
  var p = EXPR_PROSODY[expression || 'neutral'] || EXPR_PROSODY.neutral;
  var m = (p.rate || '+0%').match(/([+-]?\d+)%/);
  return m ? parseInt(m[1], 10) : 0;
}

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
// 浏览器的中文语音偏好：优先"微软晓晓系/在线神经音"（自然），其次是系统机械音（仅作兜底）。
// 注意：不同浏览器/平台可用列表不同。极速/Chrome 里常见的中文语音可能是机械感较强的
// 系统 SAPI（Huihui/Kangkang/Google 普通话），这类音质远不如后端晓晓 → 只当最后兜底，
// 绝不能因为"有任意中文语音"就把它当主音色（否则听起来会"人机感"重）。
var PREFERRED_ZH = [
  'zh-cn-xiaoxiao',   // 微软晓晓（自然女声）
  'zh-cn-xiayu',      // 微软晓雨
  'zh-cn-yunxi',      // 微软云希
  'zh-cn-yunyang',    // 微软云扬
  'xiaoxiao',
  'xiayu',
  'yunxi',
  'natural',          // Edge/Chrome 的 "Online (Natural)" 语音
  'online',
  'neural',
];
// 老式系统机械音（人机感强），只允许作为"没有任何自然音"时的最后兜底
var LEGACY_ZH = ['huihui', 'kangkang', 'yaoyao', 'yayao', 'google 普通话', 'google mandarin', '中文（中国大陆）'];
var _zhVoiceCache = null;
var _zhVoiceFallbackCache = null;

// 是否算"自然音"（晓晓级神经语音 / 在线自然语音）—— 主音色候选
function _isNaturalZhVoice(v) {
  var n = (v.name || '').toLowerCase();
  return PREFERRED_ZH.some(function (k) { return n.indexOf(k) >= 0; });
}

function _pickZhVoice() {
  if (_zhVoiceCache) return _zhVoiceCache;
  var voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  if (!voices.length) return null;

  // 1) 自然音优先（晓晓/晓雨/在线 natural/neural）
  var natural = voices.find(function (v) {
    return v.lang && v.lang.toLowerCase().replace('_', '-').indexOf('zh') === 0 && _isNaturalZhVoice(v);
  });
  if (natural) { _zhVoiceCache = natural; return natural; }
  return null; // 没有自然音 → 不缓存为"主音色"
}

// 最后兜底音色：任意中文语音（含机械音）。仅当"没有任何自然音"且必须出声时用。
function _pickZhFallbackVoice() {
  if (_zhVoiceFallbackCache) return _zhVoiceFallbackCache;
  var voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  if (!voices.length) return null;
  var zh = voices.find(function (v) {
    return v.lang && v.lang.toLowerCase().replace('_', '-').indexOf('zh') === 0;
  }) || voices.find(function (v) {
    var n = (v.name || '').toLowerCase();
    return LEGACY_ZH.some(function (k) { return n.indexOf(k) >= 0; });
  });
  _zhVoiceFallbackCache = zh || null;
  return _zhVoiceFallbackCache;
}

// 某些浏览器 voices 是异步加载的，监听一次 changed 刷新缓存
if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = function () {
    _zhVoiceCache = null;
    _zhVoiceFallbackCache = null;
    _pickZhVoice();
    _pickZhFallbackVoice();
  };
}

/**
 * 是否有"自然级"中文语音（晓晓/在线神经音等）可当主音色。
 * 只有自然音才值得让数字人全程走浏览器 —— 保证音色好 + 稳定同声 + 即时开口。
 * 若返回 false（只有机械系统音），上层应优先后端 edge-tts（晓晓，自然音质更好）。
 */
export function hasPreferredZhVoice() {
  return !!_pickZhVoice();
}

/**
 * 是否有任意中文语音（含机械音）—— 用于后端也不可用时的最后兜底判断。
 */
export function hasAnyZhVoice() {
  return !!(window.speechSynthesis && window.speechSynthesis.getVoices().length && _pickZhFallbackVoice());
}

/**
 * 取最佳可用中文音色：自然音（晓晓/在线 neural）优先，无自然音时退回任意中文（机械音兜底）。
 * 供所有浏览器朗读路径共用，保证同一时刻只用一个稳定音色。
 */
export function pickBestZhVoice() {
  return _pickZhVoice() || _pickZhFallbackVoice();
}

/**
 * 等一次 voiceschanged（某些浏览器 voices 异步加载）。
 * 返回后 getVoices() 通常已有数据。带 400ms 兜底，避免一直等。
 */
export function ensureZhVoicesLoaded() {
  return new Promise(function (resolve) {
    if (!window.speechSynthesis) { resolve(); return; }
    if (window.speechSynthesis.getVoices().length) { resolve(); return; }
    var done = false;
    var finish = function () { if (!done) { done = true; resolve(); } };
    window.speechSynthesis.onvoiceschanged = function () {
      _zhVoiceCache = null;
      _zhVoiceFallbackCache = null;
      _pickZhVoice();
      _pickZhFallbackVoice();
      finish();
    };
    setTimeout(finish, 400);
  });
}

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

    // 音色选择：自然音（晓晓/在线 neural）优先；无自然音时才用任意中文（机械音）兜底
    var zhVoice = pickBestZhVoice();
    if (zhVoice) utter.voice = zhVoice;

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
  // forceEdge = true 表示"强制晓晓"：后端失败时禁止降级浏览器语音（会变成人机音），
  // 直接抛错，由上层决定静音跳过。仅当用户明确要求"音色纯正"时使用。
  var forceEdge = !!opts.forceEdge;

  var t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  if (forceEdge) {
    // 强制晓晓：只走后端，失败即抛错（不静默降级）
    return _speakViaBackend(text, voice, rate, pitch, volume, expression)
      .then(function(url) {
        trackTTS(true, (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
        return url;
      })
      .catch(function(err) {
        trackTTS(false, (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
        throw err;
      });
  }

  // 自动模式：1. 后端 API → 2. Web Speech API（浏览器内置，无需 token，无合规风险）
  return _speakViaBackend(text, voice, rate, pitch, volume, expression)
    .catch(function(err) {
      console.warn('[TTS] backend failed, fallback to Web Speech API:', err.message);
      return _speakViaWebSpeech(text, voice, rate, pitch, volume);
    })
    .then(function(url) {
      // 成功：拿到音频 URL（blob: 或 webspeech: 兜底）
      trackTTS(true, (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
      return url;
    })
    .catch(function(err) {
      // 失败：后端与浏览器兜底都不可用
      trackTTS(false, (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
      throw err;
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
