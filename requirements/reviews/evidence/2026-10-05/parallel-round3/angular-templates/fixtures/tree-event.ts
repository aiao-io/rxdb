import { Component } from '@angular/core';
import { TreeChild } from './consumer.js';
@Component({ standalone: true, imports: [TreeChild], template: '<r3-tree-child [rootId]="0" (picked)="accept($event)" />' })
export class InvalidParent { accept(value: string): void { void value; } }
