import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMascotStore, moodFromLevel } from '../store/mascotStore'

const MASCOT_NAME = '红蛋'
const MASCOT_ROLE = '化学实验安全向导'

// 内置安全提示（与反向 RAG 风险知识库同源，覆盖常见化学实验违规）
const SAFETY_TIPS = [
  '稀释浓硫酸时，记得把酸缓慢沿杯壁倒入水中，千万别把水倒进浓硫酸里哦！',
  '加热试管时，试管口千万不要对着自己或同学，防止液体喷出烫伤～',
  '操作腐蚀性、刺激性试剂，护目镜和防护手套一定要戴好！',
  '闻试剂气味要用「扇闻法」轻轻扇动，别直接把鼻子凑近瓶口。',
  '做气体制备实验前，先检查装置气密性，确认不漏气再加料加热。',
  '氢气、一氧化碳等可燃性气体点燃前，一定要先验纯，防止爆炸！',
  '易燃溶剂附近严禁明火，建议用水浴间接加热更安全。',
  '实验结束记得关闭酒精灯、断开电源，确认无明火后再离开。',
  '取用试剂后及时盖好瓶塞，取出的试剂别倒回原瓶，按废液处理。',
  '在通风橱外操作挥发性有毒试剂很危险，有毒气体一定要在通风橱内处理。',
]

// 红蛋吐槽台词（100 句，随机触发，30 秒一轮，每句显示 5 秒）
const RANTS = [
  '又是你？我就知道你又来搞事情了。',
  '护目镜呢？别跟我说你忘了！',
  '试管口对着人？你是想给别人洗个热水澡吗？',
  '把水倒进浓硫酸？你是想上天吗！',
  '闻试剂直接凑鼻子？属狗的吗你？',
  '酒精灯不盖帽就吹？这是灭灯不是吹蜡烛！',
  '试剂瓶不盖塞子？你是想让全班都闻闻你的"杰作"？',
  '废液直接倒水池？下水道又不是垃圾场！',
  '不戴手套碰腐蚀品？你的手是铁做的？',
  '加热不检查气密性？你是想炸给自己看吗？',
  '可燃气体不验纯就点？胆子比脑子大啊！',
  '易燃溶剂旁边点明火？你是想搞篝火晚会？',
  '通风橱不开就操作有毒试剂？你肺是过滤器？',
  '试剂取多了倒回去？你是想污染整瓶吗！',
  '实验结束不关电源？想给学校省电费不是这么省的！',
  '我站这半天了腿都酸了，你就不能点个动作让我动动？',
  '别光看我，去写实验报告啊！',
  '你知道吗？我倒立的时候脑子更清醒。',
  '你做实验的样子，怎么说呢……挺有勇气的。',
  '安全规范不是摆设，是保命用的！',
  '我今天看你操作，血压比试管里的液体还高。',
  '你搅拌溶液的样子像在搅浆糊，没错，就是你脑子那种浆糊。',
  '别试了，你这个操作我能挑出十个毛病。',
  '我当安全向导这么久，你是第一个让我想辞职的。',
  '称量药品不看天平？你是用感觉称的？',
  '滴定管不排气泡？你是在测体积还是在测运气？',
  '过滤不用玻璃棒引流？你是想让液体溅到脸上？',
  '量筒读数不平视？你是在猜数字吧？',
  '药品标签不看清就取？你是盲盒爱好者？',
  '用嘴吹灭酒精灯？你嘴是灭火器吗！',
  '试管夹不夹就加热？你是想用手当夹子？',
  '烧杯直接放火上加热？你当它是铁锅呢！',
  '移液管用嘴吸？你是想喝一口试试味？',
  '浓硫酸溅手上不冲水？你是想验证它的脱水性？在自己手上？',
  '钠扔水里？你是想看烟花还是想看急诊？',
  '白磷切割不在水下？你是想让手指少几根？',
  '汞洒了不用硫粉盖？你是想全家都慢性中毒？',
  '氢氧化钠弄到衣服上不管？你是想烧个洞当通风口？',
  '加热液体加沸石？忘了？你是不是经常忘？',
  '取用试剂超过用量？你是觉得多了效果更好？',
  '玻棒搅拌使劲敲？你是想听响还是想要试管碎片？',
  '实验台乱成这样？你是在这儿开杂货铺呢？',
  '抹布擦完酸再擦碱？你是想让抹布也搞中和反应？',
  '实验服不穿就进实验室？你当这儿是菜市场？',
  '长发不扎起来？你是想给本生灯当燃料？',
  '凉鞋进实验室？脚趾头也想参与实验？',
  '吃东西喝水的习惯带到实验室？你是来找零食的？',
  '手机放实验台上？你是想看液体飞溅的慢动作回放？',
  '我在右边角落待了这么久，你就不能拖我换个位置？',
  '别戳我了！我不是按钮，我是有尊严的火柴人！',
  '你知道火柴人最大的痛苦是什么吗？没有手。所以别让我拿东西。',
  '你做实验的样子让我想起了上次那个把试管炸了的同学……就是你。',
  '今天的安全提示你看了吗？没看？那你看我干嘛？',
  '我能倒立、游泳、举重，但我不能替你做实验。所以，认真点。',
  '你知道吗，每次你忘记戴护目镜，我就少一根线条。你看我都快没了。',
  '你要是再这么操作，我下一秒就表演"摔倒"——真的摔，不是表演。',
  '说真的，你进步了——从犯十个错变成犯九个，可喜可贺。',
  '我是红蛋，不是荷包蛋。别点我那么多次。',
  '做实验就像谈恋爱，不认真就出事。别问我是怎么知道的。',
  '好了好了，我知道你觉得我话多，但安全第一啊朋友！',
  '你刚才是不是又没戴护目镜？我可什么都看见了。',
  '试管夹 you 夹不紧？它松了你也不管？',
  '你闻氯气的方式是在挑战人类肺活量极限吗？',
  '把浓盐酸当水用？你是觉得它颜色浅就安全？',
  '我数了一下，你今天打碎了三个烧杯，破纪录了。',
  '你知道为什么试管是圆底的吗？不是为了好看，是为了受热均匀！',
  '你加热固体的方式像在烤红薯，但试管不是红薯。',
  '取用试剂不标签对应？你是在玩化学版猜盲盒？',
  '你的实验报告写得像小说，但老师要的是数据不是故事。',
  '你知道我为什么叫红蛋吗？因为每次看你操作我都气得脸红。',
  '别嫌我烦，我又不是你妈，你妈不在的时候我替她唠叨几句。',
  '你那个滴定终点的颜色，是粉红不是大红，分不清？',
  '酚酞加多了？你是在做实验还是在染色？',
  '石蕊试纸你都分不清酸碱？红蓝都记不住？',
  '你的移液管精度比你的记忆还差。',
  '离心机不平衡就开？你是想搞个地震模拟？',
  '烘箱温度设错了？你想把样品烤成碳？',
  '电子天平不放称量纸？你是在给天平做记号？',
  '你的锥形瓶比脸还脏，洗一下行不行？',
  '你量取液体的方式——目测？你是自带刻度的？',
  '你搅拌的速度比搅拌方向还乱，是在画符吗？',
  '你觉得多加试剂反应就快？化学不是做饭，不是料多就好吃。',
  '你加热的时候搅拌棒在烧杯里跳舞？它不是芭蕾舞演员。',
  '你知道什么叫"少量多次"吗？不是让你每次都少量然后做一百次。',
  '你的实验服上全是洞，是化学腐蚀的还是你衣服质量差？自己想。',
  '你洗玻璃仪器用自来水冲一下就完了？油污都没洗干净你就用？',
  '试管刷到你手里不是刷试管的是敲试管的。',
  '你把酸碱废液混在一起倒？你想在废液缸里做中和热实验？',
  '你知道紧急洗眼器在哪吗？不知道？那你先去找找，别等出事了才找。',
  '灭火器你会用吗？别到时候拿起来就往人脸上喷。',
  '你的实验台上有水有酸有碱，你是在搞什么生态系统？',
  '我见过胆子大的，没见过你这么胆子大的——明火旁边倒乙醇。',
  '你把试剂瓶标签朝里放？你是怕别人知道你在用什么？',
  '你称量的时候天平门不关？风一吹你就重来，怪谁？',
  '你取浓硫酸的时候手抖？手抖就别取浓硫酸！',
  '你把热的坩埚直接放桌上？烫坏桌面是小事，烫到自己是大事。',
  '你的玻璃棒没洗干净就用？上一个试剂是什么你还记得吗？',
  '你做完实验不洗手就去吃饭？你的手比实验台还脏。',
  '你知道为什么实验室不能吃东西吗？因为化学药品不是调料！',
]

function greeting() {
  const h = new Date().getHours()
  if (h < 11) return '早上好呀～新的一天从安全实验开始！'
  if (h < 14) return '中午好！做实验前先想想安全要点哦。'
  if (h < 18) return '下午好～要不要听一条安全小贴士？'
  return '晚上好！回顾一下今天的操作有没有踩坑？'
}

function randomTip() {
  return SAFETY_TIPS[Math.floor(Math.random() * SAFETY_TIPS.length)]
}

// 动作菜单（按参考图 4x4 网格：倒立/慢跑/欢呼/踢腿/行走/树式/伸展/跳跃/滑冰/冲刺/侧抬腿/游泳/弓步/摔倒/大字/健美）
const ACTIONS = [
  { key: 'idle', label: '待机' },
  { key: 'handstand', label: '倒立' },
  { key: 'run', label: '慢跑' },
  { key: 'cheer', label: '欢呼' },
  { key: 'kick', label: '踢腿' },
  { key: 'walk', label: '叉腰' },
  { key: 'tree', label: '树式' },
  { key: 'stretch', label: '伸展' },
  { key: 'jump', label: '跳跃' },
  { key: 'skate', label: '滑冰' },
  { key: 'sprint', label: '跑路' },
  { key: 'sidekick', label: '侧抬腿' },
  { key: 'swim', label: '游泳' },
  { key: 'lunge', label: '弓步' },
  { key: 'fall', label: '摔倒' },
  { key: 'spread', label: '展翅' },
  { key: 'flex', label: '健美' },
]

const STROKE = 'var(--text)'
const STROKE_W = 5

// 简笔画火柴人：头部大圆无五官、线条粗、四肢用曲线弯曲、手脚有钩/U型等细节。
// 关键原则：head / body / arms / legs 全部在一个统一坐标系里绝对绘制，
// 每个 pose 显式给出「肩点 shoulder」和「胯点 hip」，手臂从肩出发、腿从胯出发。
function MascotSvg({ pose }) {
  // 默认站立坐标（适配 160×184 viewBox）
  let hx = 80, hy = 22
  let shoulder = { x: 80, y: 36 }
  let hip = { x: 80, y: 84 }
  let bodyPath = `M${shoulder.x} ${shoulder.y} L${hip.x} ${hip.y}`
  let legs = null
  let arms = null
  let extra = null
  let lowerTransform = undefined

  // 小工具：手臂/腿=从锚点出发的两段折线
  const limb = (from, a, b) =>
    `M${from.x} ${from.y} L${a.x} ${a.y} L${b.x} ${b.y}`

  // 统一描边属性
  const S = { fill: 'none', stroke: STROKE, strokeWidth: STROKE_W, strokeLinecap: 'round', strokeLinejoin: 'round' }

  switch (pose) {
    case 'handstand': {
      // 倒立：rotate(180)，手臂张开撑地，腿向上叉开
      lowerTransform = 'rotate(180deg)'
      shoulder = { x: 80, y: 38 }
      hip = { x: 80, y: 88 }
      bodyPath = `M80 38 L80 88`
      arms = (
        <g className="stick__arm stick__arm--handstand">
          <path d={limb(shoulder, { x: 60, y: 24 }, { x: 50, y: 10 })} {...S} />
          <path d={limb(shoulder, { x: 100, y: 24 }, { x: 110, y: 10 })} {...S} />
        </g>
      )
      legs = (
        <g className="stick__leg stick__leg--handstand">
          <path d={limb(hip, { x: 64, y: 112 }, { x: 54, y: 122 })} {...S} />
          <path d={limb(hip, { x: 96, y: 112 }, { x: 106, y: 122 })} {...S} />
        </g>
      )
      break
    }
    case 'run': {
      // 慢跑：身体前倾，一臂前甩高一臂后摆低，前腿抬膝后腿蹬直
      shoulder = { x: 78, y: 34 }
      hip = { x: 74, y: 78 }
      bodyPath = `M78 34 L74 78`
      arms = (
        <g className="stick__arm stick__arm--run">
          <path d={limb(shoulder, { x: 106, y: 20 }, { x: 120, y: 14 })} {...S} />
          <path d={limb(shoulder, { x: 50, y: 64 }, { x: 38, y: 72 })} {...S} />
        </g>
      )
      legs = (
        <g className="stick__leg stick__leg--run">
          <path d={`M74 78 L98 80 L108 70`} {...S} />
          <path d={`M74 78 Q68 96 60 120 L50 126`} {...S} />
        </g>
      )
      break
    }
    case 'cheer': {
      // 欢呼：双臂V字高举+手圈，双腿大幅张开跳
      shoulder = { x: 80, y: 44 }
      hip = { x: 82, y: 76 }
      bodyPath = `M80 44 L82 76`
      arms = (
        <g className="stick__arm stick__arm--cheer">
          <path d={limb(shoulder, { x: 48, y: 24 }, { x: 34, y: 8 })} {...S} />
          <path d={limb(shoulder, { x: 112, y: 24 }, { x: 126, y: 8 })} {...S} />
          {/* 手圈 */}
          <circle cx="34" cy="8" r="5" fill="none" stroke={STROKE} strokeWidth="3" />
          <circle cx="126" cy="8" r="5" fill="none" stroke={STROKE} strokeWidth="3" />
        </g>
      )
      legs = (
        <g className="stick__leg stick__leg--cheer">
          <path d={`M82 76 Q70 94 56 108 L44 112`} {...S} />
          <path d={`M82 76 Q94 94 108 108 L120 112`} {...S} />
        </g>
      )
      break
    }
    case 'kick': {
      // 踢腿：身体后仰，手臂向后平衡，一腿前踢高抬
      shoulder = { x: 74, y: 42 }
      hip = { x: 80, y: 88 }
      bodyPath = `M74 42 L80 88`
      arms = (
        <g className="stick__arm stick__arm--kick">
          <path d={limb(shoulder, { x: 50, y: 58 }, { x: 40, y: 66 })} {...S} />
          <path d={limb(shoulder, { x: 96, y: 28 }, { x: 106, y: 20 })} {...S} />
        </g>
      )
      legs = (
        <g className="stick__leg stick__leg--kick">
          <path d={`M80 88 L82 128 L92 128`} {...S} />
          <path d={`M80 88 L118 60 L138 48`} {...S} />
        </g>
      )
      break
    }
    case 'walk': {
      // 叉腰：双手叉腰站立，腿自然分开
      shoulder = { x: 80, y: 38 }
      hip = { x: 80, y: 88 }
      bodyPath = `M80 38 L80 88`
      arms = (
        <g className="stick__arm stick__arm--walk">
          {/* 左手背到身后 */}
          <path d={`M80 50 L64 56 L76 70`} {...S} />
          {/* 右手背到身后 */}
          <path d={`M80 50 L96 56 L84 70`} {...S} />
        </g>
      )
      legs = (
        <g className="stick__leg stick__leg--walk">
          {/* 后腿 */}
          <path d={`M80 88 Q72 108 64 128 L54 132`} {...S} />
          {/* 前腿迈出 */}
          <path d={`M80 88 Q88 106 100 126 L112 128`} {...S} />
        </g>
      )
      break
    }
    case 'tree': {
      // 树式：双手上举合圆（U型手），单腿站立另一腿后弯
      shoulder = { x: 80, y: 44 }
      hip = { x: 80, y: 90 }
      bodyPath = `M80 44 L80 90`
      arms = (
        <g className="stick__arm stick__arm--tree">
          <path d={limb(shoulder, { x: 56, y: 34 }, { x: 50, y: 20 })} {...S} />
          <path d={limb(shoulder, { x: 104, y: 34 }, { x: 110, y: 20 })} {...S} />
          {/* 手U型 */}
          <path d={`M50 20 Q42 16 44 34 Q50 30 54 26`} {...S} />
          <path d={`M110 20 Q118 16 116 34 Q110 30 106 26`} {...S} />
        </g>
      )
      legs = (
        <g className="stick__leg stick__leg--tree">
          <path d={limb(hip, { x: 80, y: 128 }, { x: 70, y: 132 })} {...S} />
          <path d={`M80 102 L58 104 L58 90`} {...S} />
        </g>
      )
      break
    }
    case 'stretch': {
      // 伸展：一手上举一手下垂，一腿前抬
      shoulder = { x: 80, y: 38 }
      hip = { x: 80, y: 88 }
      bodyPath = `M80 38 L80 88`
      arms = (
        <g className="stick__arm stick__arm--stretch">
          <path d={limb(shoulder, { x: 54, y: 28 }, { x: 42, y: 14 })} {...S} />
          <path d={limb(shoulder, { x: 106, y: 60 }, { x: 116, y: 64 })} {...S} />
        </g>
      )
      legs = (
        <g className="stick__leg stick__leg--stretch">
          <path d={`M80 88 Q78 108 78 128 L68 132`} {...S} />
          <path d={`M80 88 Q86 98 104 98 L114 94`} {...S} />
        </g>
      )
      break
    }
    case 'jump': {
      // 跳跃：身体腾空，四肢张开
      shoulder = { x: 80, y: 42 }
      hip = { x: 82, y: 76 }
      bodyPath = `M80 42 L82 76`
      arms = (
        <g className="stick__arm stick__arm--jump">
          <path d={limb(shoulder, { x: 52, y: 34 }, { x: 40, y: 26 })} {...S} />
          <path d={limb(shoulder, { x: 108, y: 34 }, { x: 120, y: 26 })} {...S} />
        </g>
      )
      legs = (
        <g className="stick__leg stick__leg--jump">
          <path d={`M82 76 Q72 90 60 98 L50 102`} {...S} />
          <path d={`M82 76 Q92 90 104 98 L114 102`} {...S} />
        </g>
      )
      break
    }
    case 'skate': {
      // 滑板：蹲在滑板上，双臂张开平衡
      shoulder = { x: 80, y: 38 }
      hip = { x: 76, y: 72 }
      bodyPath = `M80 38 L76 72`
      arms = (
        <g className="stick__arm stick__arm--skate">
          <path d={limb(shoulder, { x: 50, y: 42 }, { x: 38, y: 38 })} {...S} />
          <path d={limb(shoulder, { x: 106, y: 54 }, { x: 118, y: 60 })} {...S} />
        </g>
      )
      legs = (
        <g className="stick__leg stick__leg--skate">
          <path d={`M76 72 Q62 86 48 98`} {...S} />
          <path d={`M76 72 Q90 86 104 98`} {...S} />
        </g>
      )
      extra = (
        <g className="stick__extra stick__extra--skate">
          <line x1="30" y1="102" x2="60" y2="102" stroke={STROKE} strokeWidth={STROKE_W} strokeLinecap="round" />
          <line x1="92" y1="102" x2="122" y2="102" stroke={STROKE} strokeWidth={STROKE_W} strokeLinecap="round" />
          <circle cx="36" cy="108" r="4" fill="none" stroke={STROKE} strokeWidth="2.5" />
          <circle cx="52" cy="108" r="4" fill="none" stroke={STROKE} strokeWidth="2.5" />
          <circle cx="98" cy="108" r="4" fill="none" stroke={STROKE} strokeWidth="2.5" />
          <circle cx="116" cy="108" r="4" fill="none" stroke={STROKE} strokeWidth="2.5" />
        </g>
      )
      break
    }
    case 'sprint': {
      // 跑路：惊慌逃跑，身体大幅前倾，手臂乱甩，腿前后极限跨度，带汗滴
      shoulder = { x: 86, y: 34 }
      hip = { x: 64, y: 72 }
      bodyPath = `M86 34 L64 72`
      arms = (
        <g className="stick__arm stick__arm--sprint">
          {/* 右手背到身后 */}
          <path d={limb(shoulder, { x: 100, y: 52 }, { x: 88, y: 66 })} {...S} />
          {/* 左手背到身后 */}
          <path d={limb(shoulder, { x: 72, y: 52 }, { x: 84, y: 66 })} {...S} />
        </g>
      )
      legs = (
        <g className="stick__leg stick__leg--sprint">
          {/* 前腿大跨步 */}
          <path d={`M64 72 L34 88 L22 80`} {...S} />
          {/* 后腿蹬直 */}
          <path d={`M64 72 Q74 92 92 110 L104 114`} {...S} />
        </g>
      )
      extra = (
        <g className="stick__extra stick__extra--sprint">
          {/* 汗滴 */}
          <path d={`M100 26 q3 -8 6 0`} fill="none" stroke={STROKE} strokeWidth="3" strokeLinecap="round" />
          <path d={`M114 30 q3 -8 6 0`} fill="none" stroke={STROKE} strokeWidth="3" strokeLinecap="round" />
          {/* 速度线 */}
          <line x1="92" y1="36" x2="110" y2="38" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
          <line x1="96" y1="48" x2="114" y2="50" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
          <line x1="98" y1="60" x2="116" y2="62" stroke={STROKE} strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
        </g>
      )
      break
    }
    case 'sidekick': {
      // 侧抬腿：身体向左倾斜，双臂张开平衡，一腿水平侧踢
      shoulder = { x: 72, y: 42 }
      hip = { x: 76, y: 88 }
      bodyPath = `M72 42 L76 88`
      arms = (
        <g className="stick__arm stick__arm--sidekick">
          <path d={limb(shoulder, { x: 46, y: 30 }, { x: 36, y: 24 })} {...S} />
          <path d={limb(shoulder, { x: 98, y: 64 }, { x: 110, y: 72 })} {...S} />
        </g>
      )
      legs = (
        <g className="stick__leg stick__leg--sidekick">
          <path d={`M76 88 L76 128 L66 132`} {...S} />
          <path d={`M76 88 L116 88 L140 88`} {...S} />
        </g>
      )
      break
    }
    case 'swim': {
      // 游泳：身体水平流线型，头在右端，手臂划水，腿打水
      hx = 118; hy = 72
      shoulder = { x: 104, y: 72 }
      hip = { x: 20, y: 86 }
      bodyPath = `M104 72 Q60 74 24 86 Q8 94 4 86`
      arms = (
        <g className="stick__arm stick__arm--swim">
          <path d={`M62 78 Q56 56 42 62`} {...S} />
        </g>
      )
      legs = (
        <g className="stick__leg stick__leg--swim">
          <path d={`M4 86 L0 72`} {...S} />
        </g>
      )
      extra = (
        <g className="stick__extra stick__extra--swim">
          {/* 水滴 */}
          <path d={`M44 48 q2 -7 4 0`} fill="none" stroke={STROKE} strokeWidth="3" strokeLinecap="round" />
          <path d={`M62 40 q2 -7 4 0`} fill="none" stroke={STROKE} strokeWidth="3" strokeLinecap="round" />
          {/* 爱心 */}
          <path d={`M134 54 q5 -6 10 1 q5 -7 10 -1 q0 8 -10 16 q-10 -8 -10 -16z`} fill="none" stroke={STROKE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )
      break
    }
    case 'lunge': {
      // 弓步：双臂前后，一腿大步前弓一腿后伸
      shoulder = { x: 80, y: 38 }
      hip = { x: 78, y: 86 }
      bodyPath = `M80 38 L78 86`
      arms = (
        <g className="stick__arm stick__arm--lunge">
          <path d={limb(shoulder, { x: 52, y: 60 }, { x: 40, y: 66 })} {...S} />
          <path d={limb(shoulder, { x: 108, y: 46 }, { x: 120, y: 42 })} {...S} />
        </g>
      )
      legs = (
        <g className="stick__leg stick__leg--lunge">
          <path d={`M78 86 Q72 100 56 120 L46 124`} {...S} />
          <path d={`M78 86 Q86 104 100 126 L110 130`} {...S} />
        </g>
      )
      break
    }
    case 'fall': {
      // 摔倒：身体弯曲后仰，头在左上，四肢张开
      hx = 48; hy = 36
      shoulder = { x: 66, y: 50 }
      hip = { x: 92, y: 86 }
      bodyPath = `M66 50 Q84 70 92 86`
      arms = (
        <g className="stick__arm stick__arm--fall">
          <path d={limb(shoulder, { x: 88, y: 26 }, { x: 98, y: 16 })} {...S} />
          <path d={limb(shoulder, { x: 54, y: 76 }, { x: 44, y: 84 })} {...S} />
        </g>
      )
      legs = (
        <g className="stick__leg stick__leg--fall">
          <path d={limb(hip, { x: 112, y: 72 }, { x: 122, y: 66 })} {...S} />
          <path d={limb(hip, { x: 114, y: 100 }, { x: 126, y: 104 })} {...S} />
        </g>
      )
      break
    }
    case 'spread': {
      // 挠头：双手挠头困惑，胳膊张开远离脑袋，身体微歪，双腿交叉站，带汗滴
      shoulder = { x: 78, y: 40 }
      hip = { x: 80, y: 88 }
      bodyPath = `M78 40 L80 88`
      arms = (
        <g className="stick__arm stick__arm--spread">
          {/* 左手伸到头左侧外 */}
          <path d={`M78 50 L48 28 L38 14`} {...S} />
          {/* 右手伸到头右侧外 */}
          <path d={`M78 50 L108 28 L118 14`} {...S} />
          {/* 挠头弧线 */}
          <path d={`M38 14 Q32 6 28 14`} {...S} />
          <path d={`M118 14 Q124 6 128 14`} {...S} />
        </g>
      )
      legs = (
        <g className="stick__leg stick__leg--spread">
          {/* 支撑腿 */}
          <path d={`M80 88 Q76 108 74 130 L64 134`} {...S} />
          {/* 交叉腿 */}
          <path d={`M80 88 L86 102 L76 110`} {...S} />
        </g>
      )
      extra = (
        <g className="stick__extra stick__extra--spread">
          {/* 汗滴 */}
          <path d={`M52 18 q3 -8 6 0`} fill="none" stroke={STROKE} strokeWidth="3" strokeLinecap="round" />
        </g>
      )
      break
    }
    case 'flex': {
      // 健美/举重：双臂弯举杠铃，双腿分开站
      shoulder = { x: 80, y: 40 }
      hip = { x: 80, y: 88 }
      bodyPath = `M80 40 L80 88`
      arms = (
        <g className="stick__arm stick__arm--flex">
          <path d={`M80 52 L52 46 L44 14`} {...S} />
          <path d={`M80 52 L108 46 L116 14`} {...S} />
        </g>
      )
      legs = (
        <g className="stick__leg stick__leg--flex">
          <path d={`M80 88 Q74 108 62 128 L52 132`} {...S} />
          <path d={`M80 88 Q86 108 98 128 L108 132`} {...S} />
        </g>
      )
      extra = (
        <g className="stick__extra stick__extra--flex">
          {/* 杠铃杆 */}
          <line x1="20" y1="14" x2="140" y2="14" stroke={STROKE} strokeWidth={STROKE_W} strokeLinecap="round" />
          {/* 杠铃片 */}
          <rect x="14" y="6" width="9" height="16" rx="2" fill="none" stroke={STROKE} strokeWidth="3" />
          <rect x="137" y="6" width="9" height="16" rx="2" fill="none" stroke={STROKE} strokeWidth="3" />
        </g>
      )
      break
    }
    default: {
      // 待机：自然站立，双臂轻垂
      arms = (
        <g className="stick__arm stick__arm--idle">
          <path d={`M80 38 L62 62 L54 78`} {...S} />
          <path d={`M80 38 L98 62 L106 78`} {...S} />
        </g>
      )
      legs = (
        <g className="stick__leg stick__leg--stand">
          <path d={`M80 88 Q76 108 72 130 L62 134`} {...S} />
          <path d={`M80 88 Q84 108 88 130 L98 134`} {...S} />
        </g>
      )
    }
  }

  // 头心自动对齐：默认在肩上方14px（=头半径），特殊pose（游泳/摔倒）手动指定
  if (pose !== 'swim' && pose !== 'fall') {
    hx = 80
    hy = shoulder.y - 14
  }

  const headEl = (
    <g className="stick__head">
      <circle cx={hx} cy={hy} r="14" fill="transparent" stroke={STROKE} strokeWidth={STROKE_W} />
    </g>
  )

  return (
    <svg className="mascot__svg stick" viewBox="0 0 160 184" role="img" aria-label="安全向导 · 火柴人">
      {/* 地面投影 */}
      <ellipse
        className="stick__shadow"
        cx="80" cy="140" rx="28" ry="5"
        fill="rgba(0,0,0,0.12)"
      />

      {/* 下半身整体：倒立等需要整体旋转的姿态在这里处理 */}
      <g className="stick__lower" style={lowerTransform ? { transform: lowerTransform } : undefined}>
        {headEl}
        {legs}
        <g className="stick__body">
          <path d={bodyPath} fill="none" stroke={STROKE} strokeWidth={STROKE_W} strokeLinecap="round" strokeLinejoin="round" />
        </g>
        {arms}
      </g>

      {extra}
    </svg>
  )
}

export default function MascotAssistant() {
  const [open, setOpen] = useState(false)
  const [tip, setTip] = useState(() => randomTip())
  const [rant, setRant] = useState(null) // 随机吐槽台词
  const navigate = useNavigate()
  const rootRef = useRef(null)

  const action = useMascotStore((s) => s.action)
  const mood = useMascotStore((s) => s.mood)
  const setAction = useMascotStore((s) => s.setAction)
  const clearMoodIfExpired = useMascotStore((s) => s.clearMoodIfExpired)

  // 联动情绪过期检查
  useEffect(() => {
    const t = setInterval(() => clearMoodIfExpired(), 1000)
    return () => clearInterval(t)
  }, [clearMoodIfExpired])

  // 当前展示的姿势：mood 优先（alert/safe），否则用 action
  const pose = mood === 'alert' || mood === 'safe' ? (mood === 'alert' ? 'sprint' : 'idle') : action

  // 公仔位置：null=用 CSS 默认右下角；{left,top}=用户拖动后的固定位置
  const [pos, setPos] = useState(() => {
    try {
      const raw = localStorage.getItem('mascot-position')
      if (raw) {
        const p = JSON.parse(raw)
        if (typeof p.left === 'number' && typeof p.top === 'number') return p
      }
    } catch { /* ignore */ }
    return null
  })
  const [dragging, setDragging] = useState(false)
  const lastPos = useRef(null)
  // 联动情绪下锁定拖拽（避免情绪动作被打断），但允许拖动后回落
  const locked = mood !== 'neutral'

  const startDrag = (e) => {
    if (locked) return
    e.preventDefault()
    const el = rootRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const originLeft = pos ? pos.left : rect.left
    const originTop = pos ? pos.top : rect.top
    lastPos.current = pos
    setDragging(true)

    const onMove = (ev) => {
      const dx = ev.clientX - e.clientX
      const dy = ev.clientY - e.clientY
      if (Math.hypot(dx, dy) < 4) return
      const maxLeft = window.innerWidth - rect.width - 8
      const maxTop = window.innerHeight - rect.height - 8
      const left = Math.max(8, Math.min(maxLeft, originLeft + dx))
      const top = Math.max(8, Math.min(maxTop, originTop + dy))
      lastPos.current = { left, top }
      setPos({ left, top })
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setDragging(false)
      const moved = lastPos.current &&
        (lastPos.current.left !== originLeft || lastPos.current.top !== originTop)
      if (!moved) {
        setOpen((v) => !v) // 几乎没移动 → 当成点击，切换气泡
      } else {
        try { localStorage.setItem('mascot-position', JSON.stringify(lastPos.current)) } catch { /* ignore */ }
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // 初次进入给一句问候
  useEffect(() => {
    if (open) setTip(greeting())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // 随机吐槽：每 30 秒触发一条，显示 5 秒后消失（气泡菜单打开时不触发）
  // 同时随机换一个姿势
  useEffect(() => {
    const interval = setInterval(() => {
      if (open || locked) return
      setRant(RANTS[Math.floor(Math.random() * RANTS.length)])
      const poses = ACTIONS.map((a) => a.key).filter((k) => k !== 'idle')
      setAction(poses[Math.floor(Math.random() * poses.length)])
    }, 30000)
    return () => clearInterval(interval)
  }, [open, locked])

  // 吐槽 5 秒后自动消失
  useEffect(() => {
    if (!rant) return
    const t = setTimeout(() => setRant(null), 5000)
    return () => clearTimeout(t)
  }, [rant])

  // 沙盘高危触发跑路姿势时，弹出专属吐槽
  const prevMoodRef = useRef(mood)
  useEffect(() => {
    if (prevMoodRef.current !== 'alert' && mood === 'alert') {
      setRant('跑路了兄弟，跑路啦…')
    }
    prevMoodRef.current = mood
  }, [mood])

  // 点击外部关闭气泡
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div
      className={`mascot mascot--${pose}`}
      ref={rootRef}
      style={pos ? { left: pos.left, top: pos.top, right: 'auto', bottom: 'auto' } : undefined}
    >
      {rant && !open && (
        <div className="mascot__rant" role="status">{rant}</div>
      )}
      {open && (
        <div className="mascot__bubble-card" role="dialog" aria-label="安全向导">
          <div className="mascot__bubble-head">
            <div className="mascot__bubble-id">
              <span className="mascot__bubble-name">{MASCOT_NAME}</span>
              <span className="mascot__bubble-role">{MASCOT_ROLE}</span>
            </div>
            <button className="mascot__close" onClick={() => setOpen(false)} aria-label="关闭">×</button>
          </div>
          <p className="mascot__bubble-text">{tip}</p>

          {/* 动作菜单 */}
          <div className="mascot__actions">
            {ACTIONS.map((a) => (
              <button
                key={a.key}
                className={`mascot__act${action === a.key && mood === 'neutral' ? ' active' : ''}`}
                onClick={() => setAction(a.key)}
              >{a.label}</button>
            ))}
          </div>

          <div className="mascot__bubble-actions">
            <button
              className="mascot__btn mascot__btn--ghost"
              onClick={() => setTip(randomTip())}
            >换一条 🔁</button>
            <button
              className="mascot__btn mascot__btn--primary"
              onClick={() => { setOpen(false); navigate('/sandbox') }}
            >去避错沙盘 →</button>
          </div>
        </div>
      )}

      <button
        className={`mascot__char${dragging ? ' dragging' : ''}${locked ? ' locked' : ''}`}
        onPointerDown={startDrag}
        aria-label={open ? '收起安全向导' : '打开安全向导红蛋（可拖动）'}
        title={locked ? '正在响应你的操作～' : '安全向导 · 红蛋（拖动我换个位置）'}
      >
        <MascotSvg pose={pose} />
        <span className="mascot__badge">蛋</span>
        {mood === 'alert' && <span className="mascot__ping mascot__ping--alert" />}
        {mood === 'safe' && <span className="mascot__ping mascot__ping--safe" />}
      </button>
    </div>
  )
}
