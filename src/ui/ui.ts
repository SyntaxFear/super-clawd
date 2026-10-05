/** Terminal-style DOM panels: menus, prompts, death screen. Keyboard, mouse, touch and gamepad friendly. */
export interface MenuItem {
  label: string;
  /** Slash command alias, e.g. "/play". */
  cmd?: string;
  hint?: string;
  disabled?: boolean;
  action: () => void;
}

export interface PanelOpts {
  title: string;
  tone?: 'brand' | 'ok' | 'err' | 'warn';
  lines?: (string | { text: string; cls?: string })[];
  items: MenuItem[];
  footer?: string;
  /** Accept typed slash commands. */
  typing?: boolean;
  onBack?: () => void;
  className?: string;
  /** Show a countdown bar (seconds). */
  wide?: boolean;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export class UI {
  private panel: HTMLElement | null = null;
  private opts: PanelOpts | null = null;
  private sel = 0;
  private buf = '';
  private toastEl: HTMLElement | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private root: HTMLElement,
    private sfx: (name: string) => void,
  ) {}

  get isOpen(): boolean {
    return !!this.panel;
  }

  open(opts: PanelOpts): void {
    this.close();
    this.opts = opts;
    this.buf = '';
    this.sel = Math.max(
      0,
      opts.items.findIndex((i) => !i.disabled),
    );
    const el = document.createElement('div');
    el.className = `panel ${opts.className ?? ''} ${opts.wide ? 'wide' : ''}`;
    el.setAttribute('role', 'dialog');
    const lines = (opts.lines ?? [])
      .map((l) => (typeof l === 'string' ? { text: l, cls: '' } : l))
      .map((l) => `<div class="line ${l.cls ?? ''}">${esc(l.text) || '&nbsp;'}</div>`)
      .join('');
    el.innerHTML = `
      <div class="panel-title ${opts.tone ?? 'brand'}">${esc(opts.title)}</div>
      ${lines ? `<div class="panel-body">${lines}</div>` : ''}
      <div class="menu" role="menu"></div>
      ${opts.typing ? `<div class="prompt"><span class="caret">&gt;</span> <span class="buf"></span><span class="cursor"></span></div>` : ''}
      ${opts.footer ? `<div class="footer">${esc(opts.footer)}</div>` : ''}`;
    const menu = el.querySelector('.menu') as HTMLElement;
    opts.items.forEach((item, i) => {
      const b = document.createElement('button');
      b.className = 'item';
      b.type = 'button';
      b.disabled = !!item.disabled;
      b.innerHTML = `<span class="sel-caret">❯</span>${item.cmd ? `<span class="cmd">${esc(item.cmd)}</span>` : ''}<span class="label">${esc(item.label)}</span>${item.hint ? `<span class="hint">${esc(item.hint)}</span>` : ''}`;
      b.addEventListener('pointerenter', () => {
        if (!item.disabled) this.setSel(i);
      });
      b.addEventListener('click', (e) => {
        e.preventDefault();
        if (item.disabled) return;
        this.setSel(i);
        this.select();
      });
      menu.appendChild(b);
    });
    this.root.appendChild(el);
    this.panel = el;
    this.render();
  }

  close(): void {
    this.panel?.remove();
    this.panel = null;
    this.opts = null;
    this.buf = '';
  }

  private setSel(i: number): void {
    if (i === this.sel) return;
    this.sel = i;
    this.render();
  }

  private render(): void {
    if (!this.panel || !this.opts) return;
    const items = this.panel.querySelectorAll<HTMLButtonElement>('.item');
    const match = this.match();
    items.forEach((b, i) => {
      const active = match >= 0 ? i === match : i === this.sel;
      b.classList.toggle('sel', active);
      b.classList.toggle('dim', this.buf.length > 0 && !this.opts!.items[i].cmd?.startsWith(this.buf));
    });
    const buf = this.panel.querySelector('.buf');
    if (buf) buf.textContent = this.buf;
  }

  private match(): number {
    if (!this.opts || !this.buf) return -1;
    return this.opts.items.findIndex((i) => !i.disabled && i.cmd && i.cmd.startsWith(this.buf));
  }

  nav(dir: number): void {
    if (!this.opts) return;
    const n = this.opts.items.length;
    let i = this.sel;
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (!this.opts.items[i].disabled) break;
    }
    this.buf = '';
    this.sel = i;
    this.sfx('select');
    this.render();
  }

  select(): void {
    if (!this.opts) return;
    const m = this.match();
    const idx = m >= 0 ? m : this.sel;
    const item = this.opts.items[idx];
    if (!item || item.disabled) return;
    this.sfx('select');
    item.action();
  }

  back(): void {
    this.opts?.onBack?.();
  }

  /** Raw key hook for slash-command typing. Returns true when the key was consumed. */
  handleKey(e: KeyboardEvent): boolean {
    if (!this.opts?.typing || e.metaKey || e.ctrlKey || e.altKey) return false;
    if (e.key === 'Backspace' && this.buf) {
      this.buf = this.buf.slice(0, -1);
      this.render();
      return true;
    }
    if (e.key === 'Enter' && this.buf) {
      this.select();
      return true;
    }
    if (e.key === 'Escape' && this.buf) {
      this.buf = '';
      this.render();
      return true;
    }
    if (e.key.length === 1 && (this.buf || e.key === '/')) {
      if (this.buf.length < 20) this.buf += e.key.toLowerCase();
      this.render();
      return true;
    }
    return false;
  }

  /** Item shortcut by number key (1-9). */
  pick(n: number): void {
    const item = this.opts?.items[n];
    if (item && !item.disabled) {
      this.sel = n;
      this.render();
      this.select();
    }
  }

  toast(text: string, ms = 2200): void {
    if (!this.toastEl) {
      this.toastEl = document.createElement('div');
      this.toastEl.className = 'toast';
      this.root.appendChild(this.toastEl);
    }
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl?.classList.remove('show'), ms);
  }
}
