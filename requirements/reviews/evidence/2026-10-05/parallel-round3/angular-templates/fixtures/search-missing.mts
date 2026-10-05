import { Component } from '@angular/core';
import { LifecycleSearchChild } from './consumer.mjs';
@Component({ standalone: true, imports: [LifecycleSearchChild], template: '<r3-search-lifecycle />' })
export class InvalidParent {  }
