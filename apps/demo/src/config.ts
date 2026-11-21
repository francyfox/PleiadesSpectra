const DEFAULT_PORT = 4010;

/** The port of the demo pages; set `DEMO_PORT` to move them (the test bench and the e2e tests read the same variable). */
export const DEMO_HOST = process.env.DEMO_HOST ?? "localhost";

export const DEMO_PORT = Number(process.env.DEMO_PORT ?? DEFAULT_PORT);
