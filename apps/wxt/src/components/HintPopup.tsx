import { Button } from "@repo/ui/button";
import { Card } from "@repo/ui/card";
import { Chip } from "@repo/ui/chip";

/** Separate fixed popup: question, gesture hints, mouse buttons and the countdown. */
export function HintPopup() {
	return (
		<Card
			class="hint"
			role="dialog"
			aria-live="polite"
			x-show="isQuestionVisible"
			x-cloak=""
		>
			<div class="hint__plugin" x-text="pluginName" />
			<p class="hint__question" x-text="question" />

			<div class="hint__row" x-show="isListening">
				<template x-for="option in options" x-bind:key="option.value">
					<Chip x-text="option.gestureLabel" />
				</template>
				<span class="hint__countdown">
					<span x-text="secondsLeft" /> s
				</span>
			</div>

			<div class="hint__row">
				<template x-for="option in options" x-bind:key="option.value">
					<Button
						variant="ghost"
						x-on:click="choose(option.value)"
						x-text="option.label"
					/>
				</template>
			</div>

			<p class="hint__status" x-text="statusText" />

			<Button variant="ghost" x-show="cameraOn" x-on:click="turnOffCamera">
				Turn off camera
			</Button>
		</Card>
	);
}
