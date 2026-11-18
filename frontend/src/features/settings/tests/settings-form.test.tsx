import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { api, apiKeys } from '@/api';
import { SettingsForm } from '@/features/settings/components/settings-form';
import { renderWithQuery } from '@/tests/utils/render-with-query';

beforeEach(() => {
  window.localStorage.clear();
});

async function renderForm() {
  const settings = await api.getSettings();
  renderWithQuery(<SettingsForm />, [[apiKeys.settings(), settings]]);
}

describe('SettingsForm', () => {
  it('AT01: shows the error beside the field and saves nothing', async () => {
    const user = userEvent.setup();
    await renderForm();
    const sand = screen.getByLabelText('Sand price');
    await user.type(sand, '-5');
    await user.clear(screen.getByLabelText(/Full-block molds/));
    await user.type(screen.getByLabelText(/Full-block molds/), '2.5');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(sand).toHaveAttribute('aria-invalid', 'true');
    expect(sand).toHaveAccessibleDescription(/Enter a price of 0 or more/);
    expect(
      screen.getByLabelText(/Full-block molds/),
    ).toHaveAccessibleDescription(/whole number/);
    expect((await api.getSettings()).version).toBe(1);
  });

  it('asks before saving a zero price', async () => {
    const user = userEvent.setup();
    await renderForm();
    await user.type(screen.getByLabelText('Cement price'), '0');
    await user.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Cement');
    await user.click(screen.getByRole('button', { name: 'Save zero price' }));
    expect(await screen.findByText('Settings saved')).toBeInTheDocument();
    expect((await api.getSettings()).cement_price_per_ton).toBe('0');
  });
});
