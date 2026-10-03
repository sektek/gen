import type { ReactNode } from 'react';

import type { RenderInputArgs } from './render-input-args.js';

export type InputRenderer = (args: RenderInputArgs) => ReactNode;
