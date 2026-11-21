import { browser } from "wxt/browser";
import {
	isWidgetMessage,
	type WidgetMessage,
	type WidgetReply,
} from "./messages";

type MessageListener = (message: WidgetMessage) => void;

type ReplyListener = (reply: WidgetReply) => void;

const localListeners = new Set<MessageListener>();
const replyListeners = new Set<ReplyListener>();

/** Delivers a message to the widget without the background (used by the dev demo). */
export function publishWidgetMessage(message: WidgetMessage): void {
	for (const listener of localListeners) listener(message);
}

/** Listens to the background and to local publishes; returns the unsubscribe function. */
export function subscribeToWidgetMessages(
	listener: MessageListener,
): () => void {
	const onRuntimeMessage = (message: unknown) => {
		if (isWidgetMessage(message)) listener(message);
	};
	localListeners.add(listener);
	browser.runtime.onMessage.addListener(onRuntimeMessage);

	return () => {
		localListeners.delete(listener);
		browser.runtime.onMessage.removeListener(onRuntimeMessage);
	};
}

/** Sees the replies sent from this page, e.g. to log them on the test page. */
export function subscribeToWidgetReplies(listener: ReplyListener): () => void {
	replyListeners.add(listener);
	return () => replyListeners.delete(listener);
}

/** Fire and forget: the background may not be listening yet. */
export function sendWidgetReply(reply: WidgetReply): void {
	for (const listener of replyListeners) listener(reply);
	browser.runtime.sendMessage(reply).catch(() => {});
}
