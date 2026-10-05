import { Component } from '@angular/core';
import { TreeChild } from './consumer.mjs';
@Component({ standalone: true, imports: [TreeChild], template: '<r3-tree-child />' })
export class InvalidParent {  }
