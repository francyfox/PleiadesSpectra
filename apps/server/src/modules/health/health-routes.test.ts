import { expect, test } from "bun:test";
import { healthRoutes } from "./health-routes";

test("GET /health answers ok", async () => {
	const response = await healthRoutes.handle(
		new Request("http://localhost/health"),
	);

	expect(response.status).toBe(200);
	expect(await response.text()).toBe("ok");
});
