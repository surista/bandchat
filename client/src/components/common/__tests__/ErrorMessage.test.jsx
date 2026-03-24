import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorMessage from '../ErrorMessage';

describe('ErrorMessage', () => {
  it('renders default title', () => {
    render(<ErrorMessage />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders custom title', () => {
    render(<ErrorMessage title="Failed to load songs" />);
    expect(screen.getByText('Failed to load songs')).toBeInTheDocument();
  });

  it('renders message when provided', () => {
    render(<ErrorMessage message="Please check your connection" />);
    expect(screen.getByText('Please check your connection')).toBeInTheDocument();
  });

  it('does not render message when not provided', () => {
    const { container } = render(<ErrorMessage />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs.length).toBe(0);
  });

  it('renders retry button when onRetry is provided', () => {
    render(<ErrorMessage onRetry={() => {}} />);
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('does not render retry button when onRetry is not provided', () => {
    render(<ErrorMessage />);
    expect(screen.queryByText('Try Again')).toBeNull();
  });

  it('calls onRetry when retry button is clicked', async () => {
    const onRetry = vi.fn();
    render(<ErrorMessage onRetry={onRetry} />);

    await userEvent.click(screen.getByText('Try Again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('applies custom className', () => {
    const { container } = render(<ErrorMessage className="mt-8" />);
    expect(container.firstChild).toHaveClass('mt-8');
  });

  it('renders error icon (SVG)', () => {
    const { container } = render(<ErrorMessage />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
