// 语气词/口头禅清洗（用户反馈：数字人回答总带"哎呀哎呀"）
//
// 双保险思路：
//   - 后端 PERSONA 已加"口癖红线"（prompt 层约束模型）；
//   - 本函数是确定性兜底（输出层过滤）：无论 LLM 怎么发挥，
//     "哎呀 / 哎呀呀 / 哎哟 / 诶呀 / 哇塞"这类叹词连发都不会出现在最终文案里。
//
// 注意只清理"叹词/口癖"，不误伤正常表达：
//   - 只删完整叹词，不拆单字（"哎，对"保留"哎"）；
//   - 不清理拟声词（"嘶——""嗤啦"有表现力，保留）；
//   - 删除后整理多余空格与句首残留标点，避免留下窟窿。

const TIC_RES = [
  /哎呀+/g,      // 哎呀 / 哎呀呀 / 哎呀呀呀…
  /哎哟+[喂哦]?/g, // 哎哟 / 哎哟喂…
  /诶呀+/g,
  /哇塞+/g,
  /啧啧+/g,
  /啊哈+/g,
  /哦豁+/g,
  /哎呦/gi,
]

export function stripTics(text) {
  if (!text) return text
  let s = String(text)
  for (const re of TIC_RES) {
    s = s.replace(re, '')
  }
  // 清理删除后残留的多余空格与句首/句末标点
  s = s.replace(/[ \t]{2,}/g, ' ')
  s = s.replace(/^[\s,，。！？;；:：~、]+/, '')
  s = s.replace(/[\s,，。！？;；:：~、]+$/, '')
  return s.trim()
}

/**
 * 去掉 LLM 输出里夹带的 markdown 强调/代码标记（用户反馈"回答里别有 *"）。
 * 只删符号字符，中间的文字保留：
 *   **粗体**  → 粗体（去 `**`）
 *   *斜体*    → 斜体（去 `*`）
 *   _斜体_    → 斜体（去 `_`）
 *   `代码`    → 代码（去 `` ` ``）
 * 中文正文很少使用这些符号，删除安全。
 */
export function stripMarkdownMarks(text) {
  if (!text) return text
  return String(text)
    .replace(/\*\*/g, '')   // **粗体**
    .replace(/(?<!\*)\*(?!\*)/g, '') // 单 * 斜体（不含 **）
    .replace(/__/g, '')     // __粗体__
    .replace(/(?<!_)_(?!_)/g, '') // 单 _ 斜体
    .replace(/`/g, '')      // `代码`
    .replace(/~{2,3}/g, '') // ~~删除线~~ / ~~~删除线~~~
}

export function stripAll(text) {
  return stripMarkdownMarks(stripTics(text))
}

export default stripTics
