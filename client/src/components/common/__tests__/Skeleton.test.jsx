import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import Skeleton from '../Skeleton';

describe('Skeleton', () => {
  it('renders with animate-pulse class', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toHaveClass('animate-pulse');
  });

  it('applies custom className', () => {
    const { container } = render(<Skeleton className="h-4 w-32" />);
    expect(container.firstChild).toHaveClass('h-4', 'w-32');
  });

  it('has aria-hidden="true"', () => {
    const { container } = render(<Skeleton />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Skeleton.Message', () => {
  it('renders message skeleton structure', () => {
    const { container } = render(<Skeleton.Message />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    // Should have avatar placeholder + text lines
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(3);
  });
});

describe('Skeleton.Channel', () => {
  it('renders channel skeleton structure', () => {
    const { container } = render(<Skeleton.Channel />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Skeleton.Card', () => {
  it('renders card skeleton structure', () => {
    const { container } = render(<Skeleton.Card />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(2);
  });
});

describe('Skeleton.TableRow', () => {
  it('renders table row with default 4 columns', () => {
    const { container } = render(
      <table><tbody><Skeleton.TableRow /></tbody></table>
    );
    const cells = container.querySelectorAll('td');
    expect(cells.length).toBe(4);
  });

  it('renders custom number of columns', () => {
    const { container } = render(
      <table><tbody><Skeleton.TableRow cols={6} /></tbody></table>
    );
    const cells = container.querySelectorAll('td');
    expect(cells.length).toBe(6);
  });

  it('has aria-hidden on row', () => {
    const { container } = render(
      <table><tbody><Skeleton.TableRow /></tbody></table>
    );
    expect(container.querySelector('tr')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Skeleton.ListItem', () => {
  it('renders list item skeleton', () => {
    const { container } = render(<Skeleton.ListItem />);
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true');
  });
});
