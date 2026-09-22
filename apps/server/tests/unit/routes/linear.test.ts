import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import { createListIssuesHandler } from '@/routes/linear/routes/list-issues.js';
import { createMockExpressContext } from '../../utils/mocks.js';

const LINEAR_API_KEY = 'lin_api_test-key';

/** Minimal issue node as the Linear GraphQL API returns it */
function issueNode(overrides: Record<string, unknown> = {}) {
  return {
    id: 'issue-uuid-1',
    identifier: 'ENG-1',
    title: 'Fix the flux capacitor',
    description: 'It flickers.',
    url: 'https://linear.app/acme/issue/ENG-1',
    priority: 2,
    state: { id: 'state-1', name: 'In Progress', type: 'started', color: '#f2c94c' },
    labels: { nodes: [{ id: 'label-1', name: 'bug', color: '#eb5757' }] },
    assignee: { id: 'user-1', name: 'Ada', avatarUrl: 'https://example.com/ada.png' },
    team: { id: 'team-1', name: 'Engineering', key: 'ENG' },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
    ...overrides,
  };
}

function mockFetchResponse(payload: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => payload,
  });
}

describe('linear list-issues route', () => {
  let req: Request;
  let res: Response;

  beforeEach(() => {
    const context = createMockExpressContext();
    req = context.req;
    res = context.res;
    process.env.LINEAR_API_KEY = LINEAR_API_KEY;
  });

  afterEach(() => {
    delete process.env.LINEAR_API_KEY;
    vi.unstubAllGlobals();
  });

  it('sends the assigned-issues query with the raw API key and no Bearer prefix', async () => {
    const fetchMock = mockFetchResponse({
      data: { viewer: { assignedIssues: { nodes: [] } } },
    });
    vi.stubGlobal('fetch', fetchMock);

    await createListIssuesHandler()(req, res);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.linear.app/graphql');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe(LINEAR_API_KEY);
    expect(init.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(init.body);
    expect(body.query).toContain('assignedIssues(first: $first, orderBy: updatedAt)');
    expect(body.variables).toEqual({ first: 100 });
  });

  it('flattens label connections and splits issues by workflow state type', async () => {
    const fetchMock = mockFetchResponse({
      data: {
        viewer: {
          assignedIssues: {
            nodes: [
              issueNode(),
              issueNode({
                id: 'issue-uuid-2',
                identifier: 'ENG-2',
                state: { id: 'state-2', name: 'Done', type: 'completed', color: '#5e6ad2' },
                labels: { nodes: [] },
              }),
              issueNode({
                id: 'issue-uuid-3',
                identifier: 'ENG-3',
                state: { id: 'state-3', name: 'Canceled', type: 'canceled', color: '#95a2b3' },
                labels: null,
              }),
              issueNode({
                id: 'issue-uuid-4',
                identifier: 'ENG-4',
                state: { id: 'state-4', name: 'Backlog', type: 'backlog', color: '#bec2c8' },
              }),
            ],
          },
        },
      },
    });
    vi.stubGlobal('fetch', fetchMock);

    await createListIssuesHandler()(req, res);

    expect(res.json).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(res.json).mock.calls[0][0];

    expect(payload.success).toBe(true);
    expect(payload.openIssues.map((i: { identifier: string }) => i.identifier)).toEqual([
      'ENG-1',
      'ENG-4',
    ]);
    expect(payload.closedIssues.map((i: { identifier: string }) => i.identifier)).toEqual([
      'ENG-2',
      'ENG-3',
    ]);

    // Connection shape is flattened into a plain array
    expect(payload.openIssues[0].labels).toEqual([
      { id: 'label-1', name: 'bug', color: '#eb5757' },
    ]);
    // A missing labels connection becomes an empty array, never undefined
    expect(payload.closedIssues[1].labels).toEqual([]);
  });

  it('returns 400 when no Linear API key is configured', async () => {
    delete process.env.LINEAR_API_KEY;
    const fetchMock = mockFetchResponse({});
    vi.stubGlobal('fetch', fetchMock);

    await createListIssuesHandler()(req, res);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(vi.mocked(res.json).mock.calls[0][0].success).toBe(false);
  });

  it('surfaces GraphQL errors as a 500 with the Linear message', async () => {
    vi.stubGlobal('fetch', mockFetchResponse({ errors: [{ message: 'Authentication required' }] }));

    await createListIssuesHandler()(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(vi.mocked(res.json).mock.calls[0][0]).toEqual({
      success: false,
      error: 'Authentication required',
    });
  });

  it('surfaces a non-2xx HTTP response as a 500', async () => {
    vi.stubGlobal('fetch', mockFetchResponse({}, false, 401));

    await createListIssuesHandler()(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(vi.mocked(res.json).mock.calls[0][0].error).toContain('401');
  });
});
