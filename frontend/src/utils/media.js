/** 断点：768px / 1024px 响应式判断 */
export function isMobileViewport() {
  return window.innerWidth < 768
}

export function isTabletViewport() {
  return window.innerWidth >= 768 && window.innerWidth < 1024
}

export function isDesktopViewport() {
  return window.innerWidth >= 1024
}
