import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderApp, restoreFetch, stubApi } from '../test/harness';

describe('FormField', () => {
  afterEach(restoreFetch);

  function renderLogin() {
    stubApi({
      'GET /api/auth/me': { status: 401, body: { error: { message: 'Authentication required' } } },
    });

    return renderApp('/login');
  }

  it('hides the password until the reveal is pressed', async () => {
    renderLogin();
    const user = userEvent.setup();

    const password = await screen.findByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show password' }));

    // swapping the type is what shows the characters, so this is the assertion
    // that actually proves the reveal works
    expect(password).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Hide password' }));

    expect(password).toHaveAttribute('type', 'password');
  });

  it('can reach and work the reveal from the keyboard alone', async () => {
    renderLogin();
    const user = userEvent.setup();

    const password = await screen.findByLabelText('Password');
    password.focus();

    // one tab from the password box lands on the reveal. taking it out of the
    // tab order saved a stop and cost keyboard users the control entirely
    await user.tab();
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(password).toHaveAttribute('type', 'text');
  });

  it('offers no reveal on a field that is not a password', async () => {
    renderLogin();

    await screen.findByLabelText('Email');

    // one password box on this screen means exactly one reveal button
    expect(screen.getAllByRole('button', { name: /password/i })).toHaveLength(1);
  });
});
