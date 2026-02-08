import { getLink } from '@repo/data-ops/queries/links';
import { linkSchema, LinkSchemaType } from '@repo/data-ops/zod-schema/links';
import { LinkClickMessageType } from '@repo/data-ops/zod-schema/queue';

async function getLinkInfoFromKv(env: Env, id: string) {
	const linkInfo = await env.CACHE.get(id);
	if (!linkInfo) return null;
	try {
		const parsedLinkInfo = JSON.parse(linkInfo);
		return linkSchema.parse(parsedLinkInfo);
	} catch (error) {
		return null;
	}
}

const TTL_TIME = 60 * 60 * 24; // 1 day

async function saveLinkInfoToKv(env: Env, id: string, linkInfo: LinkSchemaType) {
	try {
		await env.CACHE.put(id, JSON.stringify(linkInfo), {
			expirationTtl: TTL_TIME,
		});
	} catch (error) {
		console.error('Error saving link info to KV:', error);
	}
}

export async function getRoutingDestinations(env: Env, id: string) {
	console.log(`fetching link info from kv for id ${id}`);
	const linkInfo = await getLinkInfoFromKv(env, id);
	if (linkInfo) {
		console.log(`kv cache hit for id ${id}`);
		return linkInfo;
	}
	console.log(`kv cache miss for id ${id}`);
	const linkInfoFromDb = await getLink(id);
	console.log(`link info from db for id ${id}: ${linkInfoFromDb}`);
	if (!linkInfoFromDb) return null;
	console.log(`saving link info to kv for id ${id}`);
	await saveLinkInfoToKv(env, id, linkInfoFromDb);
	console.log(`link info saved to kv for id ${id}`);
	return linkInfoFromDb;
}

export function getDestinationForCountry(linkInfo: LinkSchemaType, countryCode?: string) {
	console.log(`getting destination for country ${countryCode} for link info ${JSON.stringify(linkInfo)}`);
	if (!countryCode) {
		return linkInfo.destinations.default;
	}

	// Check if the country code exists in destinations
	if (linkInfo.destinations[countryCode]) {
		console.log(`destination found for country ${countryCode} in link info ${JSON.stringify(linkInfo)}`);
		return linkInfo.destinations[countryCode];
	}
	console.log(`no destination found for country ${countryCode} in link info ${JSON.stringify(linkInfo)}, falling back to default`);
	// Fallback to default
	return linkInfo.destinations.default;
}

export async function scheduleEvalWorkflow(env: Env, event: LinkClickMessageType) {
	const doId = env.EVALUATION_SCHEDULER.idFromName(`${event.data.id}:${event.data.destination}`);
	const stub = env.EVALUATION_SCHEDULER.get(doId);
	await stub.collectLinkClick(event.data.accountId, event.data.id, event.data.destination, event.data.country || 'UNKNOWN');
}

export async function captureLinkClickInBackground(env: Env, event: LinkClickMessageType) {
	await env.QUEUE.send(event);
	const doId = env.LINK_CLICK_TRACKER_OBJECT.idFromName(event.data.accountId);
	const stub = env.LINK_CLICK_TRACKER_OBJECT.get(doId);
	if (!event.data.latitude || !event.data.longitude || !event.data.country) return;
	await stub.addClick(event.data.latitude, event.data.longitude, event.data.country, Date.now());
}
