import { afterEach } from "vitest";
import { cleanup } from "@testing-library/preact";

Element.prototype.scrollIntoView = () => {};

afterEach(() => cleanup());
