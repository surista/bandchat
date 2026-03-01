/**
 * Themed error display component with optional retry button.
 */
function ErrorMessage({ title = 'Something went wrong', message, onRetry, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center p-6 text-center ${className}`}>
      <svg className="w-10 h-10 text-red-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
      <h3 className="text-[var(--color-text-primary)] font-medium mb-1">{title}</h3>
      {message && <p className="text-[var(--color-text-secondary)] text-sm mb-4">{message}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="btn btn-primary text-sm"
        >
          Try Again
        </button>
      )}
    </div>
  );
}

export default ErrorMessage;
