/**
 * 统一页头：所有 PC 页面共用，保证全站视觉连贯与高级感。
 * 用法：
 *   <PageHead
 *     eyebrow="学习者专区"
 *     title="我的学习主页"
 *     desc="这里是你的实操风险概况与学习进度"
 *     actions={<><button className="btn">xxx</button></>}
 *   />
 */
export default function PageHead({ eyebrow, title, desc, actions, children }) {
  return (
    <header className="page-head">
      <div className="page-head-main">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {desc && <p className="desc">{desc}</p>}
        {children}
      </div>
      {actions && <div className="page-head-actions">{actions}</div>}
    </header>
  )
}
