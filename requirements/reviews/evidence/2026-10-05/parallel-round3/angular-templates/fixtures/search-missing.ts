import { Component } from '@angular/core';
import { LifecycleSearchChild } from './consumer.js';
@Component({ standalone: true, imports: [LifecycleSearchChild], template: '<r3-search-lifecycle />' })
export class InvalidParent {  }
