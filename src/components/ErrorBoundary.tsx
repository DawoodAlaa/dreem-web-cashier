import { Component, type ReactNode } from 'react'
import { ErrorBox } from './ui'

/** أي خطأ في شاشة بيطلع رسالة بدل صفحة بيضا. السلة متخزنة على الجهاز فمبتضيعش مع التحديث */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="mx-auto max-w-md p-4">
        <ErrorBox text="حصل خطأ في الشاشة دي. دوس جرب تاني والبرنامج هيتحمّل من الأول" onRetry={() => location.reload()} />
      </div>
    )
  }
}
