// adds matchers like toBeInTheDocument() to expect()
import '@testing-library/jest-dom';

import { TextDecoder, TextEncoder } from 'node:util';

// jest's jsdom environment leaves TextEncoder and TextDecoder off the globals
// even though node itself has had them for years. react-router reaches for
// TextEncoder as soon as it is imported, so without this every suite that
// renders a route fails at the import with "TextEncoder is not defined".
// node's versions and the DOM ones differ only in their typings.
globalThis.TextEncoder ??= TextEncoder;
globalThis.TextDecoder ??= TextDecoder as unknown as typeof globalThis.TextDecoder;

// prosemirror measures the document whenever the selection moves, and jsdom
// implements none of these. the values do not matter - only that the calls do
// not throw. without them every test that types or clicks a toolbar button
// fails, though a plain render survives.
Range.prototype.getClientRects ??= () => Object.assign([], { item: () => null });
Range.prototype.getBoundingClientRect ??= () => new DOMRect();
document.elementFromPoint ??= () => null;
