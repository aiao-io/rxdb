import { Component } from '@angular/core';
import { TreeChild } from './consumer.js';
@Component({ standalone: true, imports: [TreeChild], template: '<r3-tree-child [rootId]="wrongId" />' })
export class InvalidParent { readonly wrongId = 'not-a-number'; }
