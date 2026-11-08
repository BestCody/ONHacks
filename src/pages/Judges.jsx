import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, LogOut, RotateCw, Search, X } from 'lucide-react';
import { useScreenScale } from '@/hooks/useScreenScale';

// The judging panel is deliberately separate from the ONHacks look: a quiet, Apple-style,
// black-and-white tool that works on a laptop or a phone.
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif';
const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'todo', label: 'To Rate' },
  { id: 'done', label: 'Rated' },
];

async function request(url, options = {}) {
  let response;
  try {
    response = await fetch(url, { credentials: 'include', ...options });
  } catch {
    const error = new Error("Can't reach the server. Check your connection and try again.");
    error.status = 0;
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Something went wrong. Please try again.');
    error.status = response.status;
    throw error;
  }
  return data;
}

const normalize = (value) => String(value).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function formatTime(value) {
  return new Date(value).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto' });
}

function ExternalLink({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[1.0625rem] font-medium text-[#1d1d1f] underline-offset-4 hover:underline">
      {children}<ArrowUpRight className="size-4" aria-hidden="true" />
    </a>
  );
}

function SignIn({ onSignedIn, notice }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(notice || '');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await request('/api/judges/signin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, password }),
      });
      setPassword('');
      onSignedIn({ name: data.name });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  const field = 'mt-1.5 block w-full h-12 rounded-xl bg-[#f5f5f7] px-4 text-[1.125rem] text-[#1d1d1f] outline-none transition focus:bg-white focus:ring-2 focus:ring-[#1d1d1f]';
  return (
    <main style={{ fontFamily: FONT }} className="min-h-screen bg-[#f5f5f7] flex items-center justify-center px-4 py-12 antialiased">
      <form onSubmit={submit} className="w-full max-w-sm rounded-[1.75rem] bg-white p-8 shadow-[0_2px_30px_rgba(0,0,0,0.06)]">
        <p className="text-[0.875rem] font-medium uppercase tracking-[0.08em] text-[#6e6e73]">ONHacks 2026</p>
        <h1 className="mt-1 text-[2.25rem] font-semibold tracking-tight text-[#1d1d1f]">Judging</h1>
        <p className="mt-2 text-[1.0625rem] leading-relaxed text-[#6e6e73]">Sign in with your full name and the judge password.</p>
        <label className="mt-7 block text-[0.875rem] font-medium text-[#6e6e73]">Your name
          <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required maxLength={60} className={field} />
        </label>
        <label className="mt-4 block text-[0.875rem] font-medium text-[#6e6e73]">Judge password
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required className={field} />
        </label>
        {error && <p role="alert" className="mt-4 text-[0.9375rem] font-medium text-[#1d1d1f]">{error}</p>}
        <button type="submit" disabled={busy} className="mt-6 h-12 w-full rounded-full bg-[#1d1d1f] text-[1.125rem] font-medium text-white transition hover:bg-black disabled:bg-[#86868b]">
          {busy ? 'Signing In…' : 'Sign In'}
        </button>
      </form>
    </main>
  );
}

// An unsaved comment is kept in this tab's storage, so it survives a reload or the judge being
// signed out mid-sentence.
const draftKey = (id) => `onhacks-judge-draft-${id}`;
function readDraft(id) {
  try {
    return window.sessionStorage.getItem(draftKey(id));
  } catch {
    return null;
  }
}
function writeDraft(id, value) {
  try {
    if (value === null) window.sessionStorage.removeItem(draftKey(id));
    else window.sessionStorage.setItem(draftKey(id), value);
  } catch {
    // Storage can be unavailable (private browsing); the comment just isn't kept across reloads.
  }
}

function ProjectCard({ project, onSaved, onSignedOut }) {
  const [score, setScore] = useState(project.review.score);
  const [saved, setSaved] = useState({
    score: project.review.score, comment: project.review.comment, updatedAt: project.review.updatedAt,
  });
  const [draft, setDraft] = useState(() => readDraft(project.id) ?? project.review.comment);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [clamped, setClamped] = useState(false);
  const aboutRef = useRef(null);
  const ratingRefs = useRef([]);
  // Saves run one at a time; the newest change waits in `queued` and is sent next, so a rating
  // tapped while a comment is saving is never dropped and the last change always wins.
  const inFlight = useRef(false);
  const queued = useRef(null);
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const dirty = draft.trim() !== saved.comment;

  useEffect(() => {
    writeDraft(project.id, dirty ? draft : null);
  }, [project.id, draft, dirty]);

  // Show a newer review loaded by Refresh (for example one saved from the judge's other device),
  // unless this card has changes of its own that haven't finished saving.
  useEffect(() => {
    const next = project.review;
    const current = savedRef.current;
    if (inFlight.current || queued.current) return;
    if (next.score === current.score && next.comment === current.comment && next.updatedAt === current.updatedAt) return;
    setSaved({ score: next.score, comment: next.comment, updatedAt: next.updatedAt });
    setScore(next.score);
    setDraft((value) => (value.trim() === current.comment ? next.comment : value));
  }, [project.review]);

  useLayoutEffect(() => {
    const element = aboutRef.current;
    if (!element) return undefined;
    const measure = () => setClamped(element.scrollHeight > element.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [project.about, expanded]);

  async function run(payload) {
    inFlight.current = true;
    setSaving(true);
    setError('');
    try {
      const { review } = await request(`/api/judges/projects/${project.id}/review`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!queued.current) {
        setSaved({ score: review.score, comment: review.comment, updatedAt: review.updatedAt });
        setScore(review.score);
        setDraft((value) => (value.trim() === payload.comment ? review.comment : value));
        onSaved(project.id, review);
      }
    } catch (failure) {
      if (failure.status === 401) {
        queued.current = null;
        onSignedOut(failure.message);
        return;
      }
      setError(failure.message);
      if (!queued.current) setScore(savedRef.current.score);
    } finally {
      inFlight.current = false;
      const next = queued.current;
      queued.current = null;
      if (next) run(next);
      else setSaving(false);
    }
  }

  function save(nextScore, comment) {
    const payload = { score: nextScore, comment };
    if (inFlight.current) queued.current = payload;
    else run(payload);
  }

  function choose(value) {
    if (value === score) return;
    setScore(value);
    save(value, draft.trim());
  }

  function onRatingKey(event, value) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = Math.min(5, Math.max(1, value + step));
    ratingRefs.current[next - 1]?.focus();
    choose(next);
  }

  const statusText = saving
    ? 'Saving…'
    : error || (dirty ? 'Unsaved comment' : saved.updatedAt ? `Saved at ${formatTime(saved.updatedAt)}` : 'Not rated yet');

  return (
    <article className="rounded-[1.375rem] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.05] sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {project.room != null && (
            <p className="text-[0.875rem] font-medium text-[#6e6e73]">Room {project.room}{project.pitchTime ? ` · ${project.pitchTime}` : ''}</p>
          )}
          <h2 className="mt-0.5 text-[1.5rem] font-semibold leading-snug tracking-tight text-[#1d1d1f] [overflow-wrap:anywhere]">{project.title}</h2>
          {project.members.length > 0 && <p className="mt-1 text-[1.0625rem] text-[#6e6e73]">{project.members.join(', ')}</p>}
        </div>
        {score && (
          <span className="shrink-0 rounded-full bg-[#1d1d1f] px-3 py-1 text-[0.875rem] font-semibold text-white">{score}/5</span>
        )}
      </div>

      {project.about && (
        <div className="mt-3">
          <p ref={aboutRef} id={`about-${project.id}`} className={`whitespace-pre-line [overflow-wrap:anywhere] text-[1.0625rem] leading-relaxed text-[#1d1d1f] ${expanded ? '' : 'line-clamp-3'}`}>{project.about}</p>
          {(clamped || expanded) && (
            <button type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-controls={`about-${project.id}`}
              className="mt-1 text-[1.0625rem] font-medium text-[#1d1d1f] hover:underline underline-offset-4">
              {expanded ? 'Less' : 'More'}
            </button>
          )}
        </div>
      )}

      {project.builtWith.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Built with">
          {project.builtWith.map((tool) => (
            <li key={tool} className="rounded-full border border-black/[0.12] px-2.5 py-0.5 text-[0.875rem] text-[#1d1d1f]">{tool}</li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        <ExternalLink href={project.url}>Devpost</ExternalLink>
        {project.video && <ExternalLink href={project.video}>Demo video</ExternalLink>}
        {project.links.map((link, index) => <ExternalLink key={link} href={link}>{project.links.length > 1 ? `Try it ${index + 1}` : 'Try it'}</ExternalLink>)}
      </div>

      <div className="mt-6 border-t border-black/[0.06] pt-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p id={`rating-label-${project.id}`} className="text-[1.0625rem] font-semibold text-[#1d1d1f]">Your rating</p>
          <p className="text-[0.875rem] text-[#6e6e73]">1 = weak · 5 = outstanding</p>
        </div>
        <div role="radiogroup" aria-labelledby={`rating-label-${project.id}`} aria-describedby={`title-${project.id}`} className="mt-3 grid grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <button key={value} type="button" role="radio" aria-checked={score === value}
              ref={(element) => { ratingRefs.current[value - 1] = element; }}
              tabIndex={(score ?? 1) === value ? 0 : -1}
              onClick={() => choose(value)}
              onKeyDown={(event) => onRatingKey(event, value)}
              className={`h-12 rounded-xl text-[1.125rem] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1d1f] ${score === value
                ? 'bg-[#1d1d1f] text-white'
                : 'bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#e8e8ed]'}`}>
              {value}
            </button>
          ))}
        </div>
        <span id={`title-${project.id}`} className="sr-only">for {project.title}</span>
        <label className="sr-only" htmlFor={`comment-${project.id}`}>Comment on {project.title}</label>
        <textarea id={`comment-${project.id}`} value={draft} maxLength={2000} rows={3}
          onChange={(event) => { setDraft(event.target.value); setError(''); }}
          onBlur={() => { if (dirty) save(score, draft.trim()); }}
          placeholder="Add a comment (optional)"
          className="mt-4 block w-full resize-y rounded-xl bg-[#f5f5f7] px-4 py-3 text-[1.0625rem] leading-relaxed text-[#1d1d1f] outline-none transition placeholder:text-[#6e6e73] focus:bg-white focus:ring-2 focus:ring-[#1d1d1f]" />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className={`text-[0.875rem] ${error ? 'font-medium text-[#1d1d1f]' : 'text-[#6e6e73]'}`} role={error ? 'alert' : undefined} aria-live="polite">{statusText}</p>
          <button type="button" onClick={() => { if (dirty) save(score, draft.trim()); }} aria-disabled={!dirty}
            className={`h-9 shrink-0 rounded-full px-4 text-[0.9375rem] font-medium text-white transition ${dirty ? 'bg-[#1d1d1f] hover:bg-black' : 'cursor-default bg-[#d2d2d7]'}`}>
            Save Comment
          </button>
        </div>
      </div>
    </article>
  );
}

export default function Judges() {
  useScreenScale();
  const [session, setSession] = useState(null);
  const [notice, setNotice] = useState('');
  const [projects, setProjects] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  // Projects rated while "To Rate" is showing stay visible until the filter changes.
  const [justRated, setJustRated] = useState(() => new Set());

  useEffect(() => {
    document.title = 'Judging · ONHacks 2026';
    request('/api/judges/session')
      .then((data) => setSession({ name: data.name }))
      .catch((failure) => { setSession(false); if (failure.status !== 401) setNotice(failure.message); });
  }, []);

  function signedOut(message = '') {
    setSession(false);
    setProjects(null);
    setNotice(message);
    // A shared laptop's next judge starts with a clean view.
    setQuery('');
    setFilter('all');
    setJustRated(new Set());
  }

  async function loadProjects() {
    setLoading(true);
    setLoadError('');
    try {
      const data = await request('/api/judges/projects');
      setProjects(data.projects);
    } catch (failure) {
      if (failure.status === 401) signedOut(failure.message);
      else setLoadError(failure.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session) loadProjects();
  }, [session]);

  async function signOut() {
    await request('/api/judges/signout', { method: 'POST' }).catch(() => {});
    signedOut();
  }

  function recordSaved(projectId, review) {
    setProjects((list) => list.map((project) => (project.id === projectId ? { ...project, review } : project)));
    if (filter === 'todo') setJustRated((ids) => new Set(ids).add(projectId));
  }

  function chooseFilter(id) {
    setFilter(id);
    setJustRated(new Set());
  }

  const ratedCount = projects?.filter((project) => project.review.score).length || 0;
  const visible = useMemo(() => {
    if (!projects) return [];
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    return projects.filter((project) => {
      const rated = Boolean(project.review.score);
      if (filter === 'todo' && rated && !justRated.has(project.id)) return false;
      if (filter === 'done' && !rated) return false;
      if (!terms.length) return true;
      const haystack = normalize([
        project.title, project.members.join(' '), project.builtWith.join(' '), project.prizes.join(' '),
        project.about, project.room != null ? `room ${project.room}` : '', project.pitchTime || '',
      ].join(' '));
      return terms.every((term) => haystack.includes(term));
    });
  }, [projects, query, filter, justRated]);

  if (session === null) {
    return <main style={{ fontFamily: FONT }} className="min-h-screen bg-[#f5f5f7] p-8 text-[1.0625rem] text-[#6e6e73]">Loading…</main>;
  }
  if (!session) {
    return <SignIn notice={notice} onSignedIn={(next) => { setNotice(''); setSession(next); }} />;
  }

  const counts = { all: projects?.length || 0, todo: (projects?.length || 0) - ratedCount, done: ratedCount };
  return (
    <div style={{ fontFamily: FONT }} className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] antialiased">
      <header className="sticky top-0 z-10 border-b border-black/[0.08] bg-white/75 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-4 px-4 sm:px-6">
          <p className="text-[1.125rem] font-semibold tracking-tight">ONHacks Judging</p>
          <div className="flex min-w-0 items-center gap-3">
            <p className="truncate text-[0.9375rem] text-[#6e6e73]">{session.name}</p>
            <button type="button" onClick={signOut} className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.9375rem] font-medium hover:bg-black/[0.05]">
              <LogOut className="size-4" aria-hidden="true" /> Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 pb-20 pt-8 sm:px-6 sm:pt-12">
        <h1 className="text-[2.75rem] font-bold leading-tight tracking-tight sm:text-[3.25rem]">Projects</h1>
        {projects && projects.length > 0 && (
          <>
            <p className="mt-1 text-[1.125rem] text-[#6e6e73]">You&apos;ve rated {ratedCount} of {projects.length}.</p>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-black/[0.08]" aria-hidden="true">
              <div className="h-full rounded-full bg-[#1d1d1f] transition-all" style={{ width: `${(ratedCount / projects.length) * 100}%` }} />
            </div>
          </>
        )}

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-[1.125rem] -translate-y-1/2 text-[#6e6e73]" aria-hidden="true" />
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects, teammates, tools, or rooms" aria-label="Search projects"
              className="h-11 w-full rounded-xl bg-black/[0.06] pl-10 pr-10 text-[1.0625rem] outline-none transition placeholder:text-[#6e6e73] focus:bg-white focus:ring-2 focus:ring-[#1d1d1f] [&::-webkit-search-cancel-button]:hidden" />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search"
                className="absolute right-2.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full bg-[#86868b] text-white">
                <X className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div role="group" aria-label="Filter projects" className="flex flex-1 rounded-[0.625rem] bg-black/[0.06] p-0.5 sm:flex-none">
              {FILTERS.map(({ id, label }) => (
                <button key={id} type="button" aria-pressed={filter === id} onClick={() => chooseFilter(id)}
                  className={`h-10 flex-1 whitespace-nowrap rounded-[0.5rem] px-3 text-[0.9375rem] font-medium transition sm:flex-none ${filter === id
                    ? 'bg-white shadow-[0_1px_3px_rgba(0,0,0,0.12)]' : 'text-[#6e6e73] hover:text-[#1d1d1f]'}`}>
                  {label} <span className="tabular-nums text-[#6e6e73]">{counts[id]}</span>
                </button>
              ))}
            </div>
            <button type="button" onClick={loadProjects} disabled={loading} aria-label="Refresh projects"
              className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-black/[0.06] disabled:opacity-40">
              <RotateCw className={`size-[1.125rem] ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button>
          </div>
        </div>

        {loadError && (
          <p role="alert" className="mt-6 rounded-2xl bg-white p-5 text-[1.0625rem] font-medium ring-1 ring-black/[0.08]">{loadError}</p>
        )}
        {!projects && !loadError && <p className="mt-10 text-[1.0625rem] text-[#6e6e73]">Loading projects…</p>}
        {projects && projects.length === 0 && (
          <div className="mt-10 rounded-[1.375rem] bg-white p-10 text-center ring-1 ring-black/[0.05]">
            <p className="text-[1.3125rem] font-semibold">No projects yet</p>
            <p className="mt-1 text-[1.0625rem] text-[#6e6e73]">Projects appear here once organizers import the Devpost submissions. Tap refresh to check again.</p>
          </div>
        )}
        {projects && projects.length > 0 && visible.length === 0 && (
          <p className="mt-10 text-center text-[1.0625rem] text-[#6e6e73]">
            {query ? `No projects match “${query}”.` : filter === 'todo' ? 'You’ve rated every project.' : 'You haven’t rated any projects yet.'}
          </p>
        )}
        <div className="mt-6 space-y-4">
          {visible.map((project) => (
            <ProjectCard key={project.id} project={project} onSaved={recordSaved} onSignedOut={signedOut} />
          ))}
        </div>
      </main>
    </div>
  );
}
