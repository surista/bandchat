import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import UpgradePrompt from '../UpgradePrompt';

describe('UpgradePrompt', () => {
  it('renders default feature name', () => {
    render(<UpgradePrompt />);
    expect(screen.getByText('Pro Feature')).toBeInTheDocument();
  });

  it('renders custom feature name', () => {
    render(<UpgradePrompt feature="Song Intelligence" />);
    expect(screen.getByText('Song Intelligence')).toBeInTheDocument();
  });

  it('renders default description', () => {
    render(<UpgradePrompt />);
    expect(screen.getByText('This feature is available on the Pro plan.')).toBeInTheDocument();
  });

  it('renders custom description', () => {
    render(<UpgradePrompt description="Unlock AI-powered song suggestions" />);
    expect(screen.getByText('Unlock AI-powered song suggestions')).toBeInTheDocument();
  });

  it('mentions mobile app for upgrade', () => {
    render(<UpgradePrompt />);
    expect(screen.getByText('BandChat mobile app')).toBeInTheDocument();
  });

  it('shows lock emoji', () => {
    render(<UpgradePrompt />);
    expect(screen.getByText('🔒')).toBeInTheDocument();
  });
});
