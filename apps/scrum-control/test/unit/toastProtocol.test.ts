/**
 * D6 of story 004: the two toast buttons and the `scrum-control://` round trip they take.
 *
 * The toast itself can only be seen on Windows, but both ends of the trip are plain string
 * work — the XML handed to the shell, and the argv scan that catches the URI coming back — so
 * the contract between them is testable without Electron.
 */

import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildProtocolRegistration,
  buildScrumToastXml,
  buildToastXml,
  parseToastAction,
  projectActionUri,
  protocolClientTarget,
  toastActionFromArgv,
  toastActionUri,
} from '../../src/main/toast-protocol.ts';

const xml = (overrides: Partial<Parameters<typeof buildToastXml>[0]> = {}): string =>
  buildToastXml({
    title: 'api — Finished',
    lines: ['claude-control · dev', 'All done.'],
    imageUri: null,
    sessionId: 's-1',
    ...overrides,
  });

describe('buildToastXml', () => {
  it('renders both buttons as protocol actions carrying the session id', () => {
    const body = xml({ sessionId: 'abc-123' });
    expect(body).toContain(
      '<action content="Jump" activationType="protocol" arguments="scrum-control://jump?session=abc-123"/>',
    );
    expect(body).toContain(
      '<action content="Mute this session" activationType="protocol" ' +
        'arguments="scrum-control://mute?session=abc-123"/>',
    );
  });

  it('keeps title, body lines, logo and silence — toastXml replaces all of them', () => {
    const body = xml({ imageUri: 'file:///C:/app/assets/icons/app-done.png' });
    expect(body).toContain('<text>api — Finished</text>');
    expect(body).toContain('<text>claude-control · dev</text>');
    expect(body).toContain('<text>All done.</text>');
    expect(body).toContain('<image placement="appLogoOverride" src="file:///C:/app/assets/icons/app-done.png"/>');
    expect(body).toContain('<audio silent="true"/>');
  });

  it('drops empty lines and omits the logo when the art is not reachable', () => {
    const body = xml({ lines: ['', 'only this'] });
    expect(body).not.toContain('<text></text>');
    expect(body).not.toContain('<image');
    expect(body.match(/<text>/g)).toHaveLength(2);
  });

  it('escapes markup so a session name cannot break the document', () => {
    const body = xml({ title: 'a & b <x>', sessionId: 'a"b' });
    expect(body).toContain('<text>a &amp; b &lt;x&gt;</text>');
    expect(body).toContain('arguments="scrum-control://mute?session=a%22b"');
  });

  it('leaves the toast body on default activation, so the click handler still fires', () => {
    expect(xml().startsWith('<toast>')).toBe(true);
    expect(xml()).not.toContain('<toast activationType');
  });
});

describe('parseToastAction', () => {
  it('reads both verbs', () => {
    expect(parseToastAction(toastActionUri('jump', 's-1'))).toEqual({ action: 'jump', sessionId: 's-1' });
    expect(parseToastAction(toastActionUri('mute', 's-1'))).toEqual({ action: 'mute', sessionId: 's-1' });
  });

  it('decodes a session id the shell handed back percent-encoded', () => {
    expect(parseToastAction(toastActionUri('mute', 'a b/c'))).toEqual({ action: 'mute', sessionId: 'a b/c' });
  });

  it('accepts the shapes the shell may produce for the same URI', () => {
    expect(parseToastAction('scrum-control://jump/?session=s-1')?.action).toBe('jump');
    expect(parseToastAction('scrum-control:jump?session=s-1')?.action).toBe('jump');
    expect(parseToastAction('SCRUM-CONTROL://JUMP?session=s-1')?.action).toBe('jump');
  });

  it('rejects anything that is not one of our two actions', () => {
    expect(parseToastAction('scrum-control://quit?session=s-1')).toBeNull();
    expect(parseToastAction('scrum-control://mute')).toBeNull();
    expect(parseToastAction('scrum-control://mute?session=')).toBeNull();
    expect(parseToastAction('https://example.com/mute?session=s-1')).toBeNull();
    expect(parseToastAction('--show')).toBeNull();
    expect(parseToastAction('scrum-control://')).toBeNull();
  });
});

describe('scrum project actions', () => {
  const key = 'c:/development/hantsch/claude';

  it('round-trips a project key, including the separators and the drive colon', () => {
    expect(projectActionUri(key)).toBe('scrum-control://project/c%3A%2Fdevelopment%2Fhantsch%2Fclaude');
    expect(parseToastAction(projectActionUri(key))).toEqual({ action: 'project', projectKey: key });
    expect(parseToastAction(projectActionUri('//wsl.localhost/ubuntu/home/u/my proj'))).toEqual({
      action: 'project',
      projectKey: '//wsl.localhost/ubuntu/home/u/my proj',
    });
  });

  it('accepts the shapes the shell may produce for the same URI', () => {
    const encoded = encodeURIComponent(key);
    for (const uri of [
      `scrum-control://project/${encoded}/`,
      `scrum-control:project/${encoded}`,
      `SCRUM-CONTROL://PROJECT/${encoded}`,
      `scrum-control://project/${encoded}?x=1`,
    ]) {
      expect(parseToastAction(uri), uri).toEqual({ action: 'project', projectKey: key });
    }
  });

  it('rejects a project URI without a key or with broken encoding', () => {
    expect(parseToastAction('scrum-control://project')).toBeNull();
    expect(parseToastAction('scrum-control://project/')).toBeNull();
    expect(parseToastAction('scrum-control://project/%E0%A4%A')).toBeNull();
    expect(parseToastAction('scrum-control://projects/abc')).toBeNull();
  });

  it('is found in argv like the session actions', () => {
    expect(toastActionFromArgv(['C:/app/electron.exe', projectActionUri(key)])).toEqual({
      action: 'project',
      projectKey: key,
    });
  });

  it('renders one Open window button instead of Jump and Mute', () => {
    const body = buildScrumToastXml({ title: 'claude: sprint S14 started', lines: ['Login'], projectKey: key });
    expect(body).toContain(
      `<action content="Open window" activationType="protocol" arguments="${projectActionUri(key)}"/>`,
    );
    expect(body).not.toContain('Jump');
    expect(body).not.toContain('Mute');
    expect(body).toContain('<text>claude: sprint S14 started</text>');
    expect(body.startsWith('<toast>')).toBe(true);
  });
});

describe('toastActionFromArgv', () => {
  it('finds the URI wherever the shell put it on the command line', () => {
    const argv = ['C:/app/electron.exe', 'C:/app/out/main/index.js', 'scrum-control://mute?session=s-9'];
    expect(toastActionFromArgv(argv)).toEqual({ action: 'mute', sessionId: 's-9' });
  });

  it('is null for an ordinary second start, so that keeps opening the window', () => {
    expect(toastActionFromArgv(['C:/app/ScrumControl.exe'])).toBeNull();
    expect(toastActionFromArgv(['C:/app/ScrumControl.exe', '--show', 'sessions'])).toBeNull();
    expect(toastActionFromArgv([])).toBeNull();
  });
});

describe('protocolClientTarget', () => {
  it('registers with no arguments when packaged', () => {
    expect(protocolClientTarget('C:/app/ScrumControl.exe', true, undefined)).toEqual({});
    expect(protocolClientTarget('C:/app/ScrumControl.exe', true, 'C:/app/out/main/index.js')).toEqual({});
  });

  it('registers Electron plus the resolved script path in dev', () => {
    expect(protocolClientTarget('C:/electron/electron.exe', false, 'out/main/index.js')).toEqual({
      path: 'C:/electron/electron.exe',
      args: [resolve('out/main/index.js')],
    });
  });
});

describe('buildProtocolRegistration', () => {
  it('is unsupported off Windows, regardless of the target or outcome', () => {
    expect(buildProtocolRegistration('darwin', {}, { ok: true }, 'C:/app/ScrumControl.exe')).toEqual({
      state: 'unsupported',
    });
    expect(buildProtocolRegistration('linux', {}, { ok: false }, '/usr/bin/scrum-control')).toEqual({
      state: 'unsupported',
    });
  });

  it('registers with the explicit path and args in dev', () => {
    const target = { path: 'C:/electron/electron.exe', args: [resolve('out/main/index.js')] };
    expect(buildProtocolRegistration('win32', target, { ok: true }, 'C:/electron/electron.exe')).toEqual({
      state: 'registered',
      path: 'C:/electron/electron.exe',
      args: [resolve('out/main/index.js')],
    });
  });

  it('registers with process.execPath when packaged (no explicit target path)', () => {
    const target = protocolClientTarget('C:/app/ScrumControl.exe', true, undefined);
    const registration = buildProtocolRegistration('win32', target, { ok: true }, 'C:/app/ScrumControl.exe');
    expect(registration).toEqual({
      state: 'registered',
      path: 'C:/app/ScrumControl.exe',
      args: [],
    });
    expect(JSON.stringify(registration)).not.toContain('<installed exe>');
  });

  it('is failed with a reason when setAsDefaultProtocolClient throws', () => {
    const registration = buildProtocolRegistration(
      'win32',
      {},
      { ok: false, error: new Error('registry access denied') },
      'C:/app/ScrumControl.exe',
    );
    expect(registration.state).toBe('failed');
    expect(registration).toMatchObject({ path: 'C:/app/ScrumControl.exe' });
    if (registration.state === 'failed') {
      expect(registration.reason).toContain('registry access denied');
    }
  });

  it('is failed with a reason when setAsDefaultProtocolClient just returns false', () => {
    const registration = buildProtocolRegistration('win32', {}, { ok: false }, 'C:/app/ScrumControl.exe');
    expect(registration.state).toBe('failed');
    if (registration.state === 'failed') {
      expect(registration.reason.length).toBeGreaterThan(0);
    }
  });
});
