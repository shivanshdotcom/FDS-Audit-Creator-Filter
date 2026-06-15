import type {
	FDSFilter,
	FDSFilterHTMLElementBuilderArgs,
} from '@liferay/js-api/data-set';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuditCreator {
	id: number;
	name: string;
	givenName: string;
	familyName: string;
}

interface AuditEvent {
	creator: AuditCreator;
	eventType: string;
	dateCreated: string;
}

interface SharpersItem {
	id: number;
	externalReferenceCode: string;
	auditEvents: AuditEvent[];
}

interface FilterData {
	inputValue: string;
	oDataExpression: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalise(s: string): string {
	return (s ?? '').trim().toLowerCase();
}

function getLatestUpdateEvent(auditEvents: AuditEvent[]): AuditEvent | null {
	const updateEvents = (auditEvents ?? []).filter(
		(e) => e.eventType === 'UPDATE'
	);

	if (updateEvents.length === 0) return null;

	return updateEvents.sort(
		(a, b) =>
			new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime()
	)[0];
}

async function fetchMatchedERCs(creatorQuery: string): Promise<string[]> {
	const query = normalise(creatorQuery);

	const authToken = (window as any).Liferay?.authToken ?? '';

	const BASE =
		`/o/c/sharpers/?nestedFields=auditEvents` +
		`&nestedFieldsDepth=2` +
		`&pageSize=200` +
		`&p_auth=${authToken}`;

	let page = 1;
	let lastPage = 1;
	const matchedERCs: string[] = [];

	do {
		const url = `${BASE}&page=${page}`;

		console.log('[AuditCreatorFilter] Fetching:', url);

		const response = await fetch(url, {
			credentials: 'include',
			headers: { 'x-csrf-token': authToken },
		});

		console.log('[AuditCreatorFilter] Status:', response.status);

		if (!response.ok) {
			console.error('[AuditCreatorFilter] fetch error', response.status);
			break;
		}

		const data = await response.json();

		console.log('[AuditCreatorFilter] totalCount:', data.totalCount);

		lastPage = data.lastPage ?? 1;

		(data.items as SharpersItem[]).forEach((item) => {
			const latestUpdate = getLatestUpdateEvent(item.auditEvents);

			console.log(
				'[AuditCreatorFilter] Item:', item.id,
				'| Latest UPDATE event:', latestUpdate
					? `${latestUpdate.dateCreated} by ${latestUpdate.creator?.name}`
					: 'none'
			);

			// Skip records with no UPDATE event
			if (!latestUpdate?.creator) return;

			const c = latestUpdate.creator;
			const matched =
				normalise(c.name).includes(query) ||
				normalise(c.givenName).includes(query) ||
				normalise(c.familyName).includes(query);

			console.log(
				'[AuditCreatorFilter] Comparing:',
				normalise(c.name),
				'vs query:',
				query,
				'→',
				matched ? '✓ match' : '✗ no match'
			);

			if (matched) {
				matchedERCs.push(item.externalReferenceCode);
			}
		});

		page++;
	} while (page <= lastPage);

	console.log('[AuditCreatorFilter] Matched ERCs:', matchedERCs);

	return matchedERCs;
}

function buildOData(ercs: string[]): string {
	if (ercs.length === 0) return '';

	if (ercs.length === 1) {
		return `externalReferenceCode eq '${ercs[0]}'`;
	}

	return ercs
		.map((erc) => `externalReferenceCode eq '${erc}'`)
		.join(' or ');
}

// ---------------------------------------------------------------------------
// FDS Filter contract
// ---------------------------------------------------------------------------

function descriptionBuilder(selectedData: FilterData): string {
	return `Last updated by: "${selectedData.inputValue}"`;
}

function htmlElementBuilder({
	filter,
	setFilter,
}: FDSFilterHTMLElementBuilderArgs<FilterData>): HTMLElement {
	// ---- Wrapper ----
	const wrapper = document.createElement('div');
	wrapper.className = 'dropdown-item p-2';
	wrapper.style.minWidth = '260px';

	// ---- Label ----
	const label = document.createElement('label');
	label.className = 'mb-1 font-weight-semi-bold';
	label.style.fontSize = '12px';
	label.innerText = 'Filter by Last Updated By';

	// ---- Hint ----
	const hint = document.createElement('p');
	hint.className = 'mt-0 mb-1 text-secondary';
	hint.style.fontSize = '11px';
	hint.innerText = 'Matches the most recent UPDATE event creator';

	// ---- Input ----
	const input = document.createElement('input');
	input.className = 'form-control form-control-sm';
	input.placeholder = 'Type creator name…';
	input.value = filter?.selectedData?.inputValue ?? '';

	// ---- Status text ----
	const status = document.createElement('p');
	status.className = 'mt-1 mb-0 text-secondary';
	status.style.fontSize = '11px';
	status.innerText = '';

	// ---- Submit button ----
	const button = document.createElement('button');
	button.className = 'btn btn-block btn-primary btn-sm mt-2';
	button.innerText = 'Apply Filter';

	button.onclick = async () => {
		const inputValue = input.value.trim();

		if (!inputValue) {
			setFilter({ selectedData: { inputValue: '', oDataExpression: '' } });
			status.innerText = 'Filter cleared.';
			return;
		}

		button.disabled = true;
		button.innerText = 'Searching…';
		status.innerText = 'Fetching audit records…';

		try {
			const ercs = await fetchMatchedERCs(inputValue);

			if (ercs.length === 0) {
				status.innerText = '✗ No records matched. Filter not applied.';
				button.disabled = false;
				button.innerText = 'Apply Filter';
				return;
			}

			const oDataExpression = buildOData(ercs);

			console.log('[AuditCreatorFilter] OData expression:', oDataExpression);

			status.innerText = `✓ ${ercs.length} record(s) matched.`;

			setFilter({
				selectedData: {
					inputValue,
					oDataExpression,
				},
			});
		} catch (err) {
			console.error('[AuditCreatorFilter] error', err);
			status.innerText = 'Error fetching records.';
		} finally {
			button.disabled = false;
			button.innerText = 'Apply Filter';
		}
	};

	// Support Enter key
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') button.click();
	});

	wrapper.appendChild(label);
	wrapper.appendChild(hint);
	wrapper.appendChild(input);
	wrapper.appendChild(button);
	wrapper.appendChild(status);

	return wrapper;
}

function oDataQueryBuilder(selectedData: FilterData): string {
	return selectedData?.oDataExpression ?? '';
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const fdsFilter: FDSFilter<FilterData> = {
	descriptionBuilder,
	htmlElementBuilder,
	oDataQueryBuilder,
};

export default fdsFilter;
