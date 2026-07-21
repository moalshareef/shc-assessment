import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface FollowUpErrorBoundaryProps {
  children: ReactNode
  resetKey: string
}

interface FollowUpErrorBoundaryState {
  hasError: boolean
}

export class FollowUpErrorBoundary extends Component<FollowUpErrorBoundaryProps, FollowUpErrorBoundaryState> {
  state: FollowUpErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): FollowUpErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[financial-control] Follow-up panel render failed.', error, info)
  }

  componentDidUpdate(previousProps: FollowUpErrorBoundaryProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <section className="detail-section follow-up-actions" data-testid="manager-follow-up-actions-error" role="alert">
        <div className="manager-section__header">
          <div>
            <span className="eyebrow">إجراءات المتابعة</span>
            <h2>تذكير الإدارة وتوجيه الموظف</h2>
          </div>
        </div>
        <p>تعذر تحميل بيانات المتابعات، أعد المحاولة.</p>
        <div className="follow-up-action-buttons">
          <button className="secondary-button" type="button" disabled>إرسال تذكير</button>
          <button className="secondary-button" type="button" disabled>توجيه الموظف</button>
        </div>
      </section>
    )
  }
}
