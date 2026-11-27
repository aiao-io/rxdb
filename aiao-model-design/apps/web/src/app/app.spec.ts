import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { App } from './app';
import { appRoutes } from './app.routes';

describe('App', () => {
  it('renders the router shell', async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter(appRoutes)]
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy();
  });
});
