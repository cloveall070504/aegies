/**
 * 场景准入谓词（唯一真相源）
 * 仅允许：内置场景(builtin) 或 实验类场景(category=experiment)。
 * 历史上一度写死 `scene_code === 'chem_lab'`，新增化学实验场景后在
 * 模拟/扫描等入口看不到。所有场景列表过滤（store / hooks）统一走这里。
 */
export const isAllowedScene = (s) => !s || s.builtin === 1 || s.category === 'experiment'
