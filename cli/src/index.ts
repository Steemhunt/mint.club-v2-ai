#!/usr/bin/env node

import { config } from 'dotenv';
import { resolve } from 'path';
import { homedir } from 'os';
import { createProgram } from './program';

declare const __VERSION__: string;

config({ path: resolve(homedir(), '.mintclub', '.env') });
config();

const version = typeof __VERSION__ === 'string' ? __VERSION__ : '0.0.0-dev';
await createProgram(version).parseAsync();
