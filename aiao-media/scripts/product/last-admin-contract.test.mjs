import { test } from 'node:test';
import { verifyLastAdminContract } from './last-admin-contract.mjs';

test('独立数据库拒绝撤销或停用最后一名管理员，已停用成员不计入可用管理员', verifyLastAdminContract);
