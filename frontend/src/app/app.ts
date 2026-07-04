import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  standalone: false,
  template: `
    <p-toast position="bottom-right" />
    <router-outlet />
  `,
})
export class App {}
