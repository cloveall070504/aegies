import { Component } from 'react'

/**
 * React ErrorBoundary：捕获子组件渲染异常，防止整页白屏。
 * 生产环境显示友好错误提示 + 刷新按钮。
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo })
    // 可接入日志上报
    console.error('[ErrorBoundary]', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleReset)
      }
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          padding: '24px',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>😵</div>
          <h2 style={{ marginBottom: 8, color: 'var(--text)' }}>页面出错了</h2>
          <p style={{ color: 'var(--muted)', marginBottom: 24, maxWidth: 400 }}>
            页面遇到了意外错误。可以尝试刷新页面，或返回上一步重试。
          </p>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={this.handleReload}
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--accent, #4f8cff)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              刷新页面
            </button>
            <button
              onClick={this.handleReset}
              style={{
                padding: '8px 20px',
                borderRadius: 8,
                border: '1px solid var(--border, #ddd)',
                background: 'transparent',
                color: 'var(--text)',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              重试
            </button>
          </div>
          {this.state.error && (
            <details style={{ marginTop: 16, maxWidth: 600, width: '100%' }}>
              <summary style={{ cursor: 'pointer', color: 'var(--muted)', fontSize: 13 }}>
                查看错误详情
              </summary>
              <pre style={{
                marginTop: 8,
                padding: 12,
                background: 'var(--card-bg, #f5f5f5)',
                borderRadius: 8,
                overflow: 'auto',
                fontSize: 12,
                textAlign: 'left',
                color: 'var(--red, #e53e3e)',
              }}>
                {this.state.error?.toString()}
                {this.state.errorInfo?.componentStack}
              </pre>
            </details>
          )}
        </div>
      )
    }
    return this.props.children
  }
}
