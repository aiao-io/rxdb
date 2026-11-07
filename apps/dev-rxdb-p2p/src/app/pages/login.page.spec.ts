import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import LoginPage from './login.page';

const submission = (action: 'signIn' | 'signUp', valid: boolean): Event => {
  const form = document.createElement('form');
  form.reportValidity = vi.fn(() => valid);
  const submitter = document.createElement('button');
  submitter.value = action;
  const event = new SubmitEvent('submit', { submitter });
  Object.defineProperty(event, 'target', { value: form });
  return event;
};

describe('LoginPage', () => {
  const auth = { signIn: vi.fn(async () => undefined), signUp: vi.fn(async () => undefined) };
  const router = { navigateByUrl: vi.fn(async () => true) };
  let page: LoginPage;

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router }
      ]
    });
    page = TestBed.runInInjectionContext(() => new LoginPage());
  });

  it('applies the same browser validation to registration and login', async () => {
    await page.submit(submission('signUp', false));
    await page.submit(submission('signIn', false));
    expect(auth.signUp).not.toHaveBeenCalled();
    expect(auth.signIn).not.toHaveBeenCalled();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('uses the submitted registration action and trims the email', async () => {
    page.email.set(' person@example.com ');
    page.password.set('password');
    await page.submit(submission('signUp', true));
    expect(auth.signUp).toHaveBeenCalledWith('person@example.com', 'password');
    expect(auth.signIn).not.toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/');
  });

  it('keeps authentication failures on the form and restores the buttons', async () => {
    auth.signIn.mockRejectedValueOnce(new Error('邮箱或密码错误'));
    await page.submit(submission('signIn', true));
    expect(page.error()).toBe('邮箱或密码错误');
    expect(page.busy()).toBe(false);
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
});
