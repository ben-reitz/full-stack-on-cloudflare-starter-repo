import { DurableObject } from 'cloudflare:workers';

interface ClickData {
	accountId: string;
	linkId: string;
	destinationUrl: string;
	destinationCountryCode: string;
}

export class EvaluationScheduler extends DurableObject<Env> {
	clickData: ClickData | undefined;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.blockConcurrencyWhile(async () => {
			this.clickData = await ctx.storage.get<ClickData>('click_data');
		});
	}

	async collectLinkClick(accountId: string, linkId: string, destinationUrl: string, destinationCountryCode: string) {
		this.clickData = {
			accountId,
			linkId,
			destinationUrl,
			destinationCountryCode,
		};
		await this.ctx.storage.put('click_data', this.clickData);

		const alarm = await this.ctx.storage.getAlarm();
		if (!alarm) {
			const oneDay = Date.now() + 24 * 60 * 60 * 1000;
			await this.ctx.storage.setAlarm(oneDay);
		}
	}

    async alarm() {
        console.log('Evaluation scheduler alarm triggered');
        const clickData = this.clickData;
        if (!clickData) throw new Error('Click data not set');
        await this.env.DESTINATION_EVALUATION_WORKFLOW.create({params: {
            linkId: clickData.linkId,
            accountId: clickData.accountId,
            destinationUrl: clickData.destinationUrl,
        }});
    }
}
