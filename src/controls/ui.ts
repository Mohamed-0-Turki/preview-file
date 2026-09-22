export interface SegmentedResult<T> {
  el: HTMLDivElement
  setActive: (value: T) => void
}

export function makeButton(
  content: string,
  label: string,
  onClick: () => void,
  options: { pressed?: boolean; chip?: boolean } = {}
): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = `pf-btn${options.pressed ? ' pf-btn--on' : ''}${options.chip ? ' pf-btn--chip' : ''}`
  button.innerHTML = content
  button.title = label
  button.setAttribute('aria-label', label)
  if (options.pressed !== undefined) {
    button.setAttribute('aria-pressed', String(options.pressed))
  }
  button.addEventListener('click', () => {
    try {
      onClick()
    } catch (error) {
      console.error('[preview-file] control failed', error)
    }
  })
  return button
}

export function makeSegmented<T extends string | number>(
  label: string,
  options: readonly { label: string; value: T }[],
  initial: T,
  onChange: (value: T) => void,
  stack = false
): SegmentedResult<T> {
  const container = document.createElement('div')
  container.className = stack ? 'pf-seg pf-seg--stack' : 'pf-seg'
  container.setAttribute('role', 'radiogroup')
  container.setAttribute('aria-label', label)

  let activeIndex = Math.max(0, options.findIndex((option) => option.value === initial))
  const buttons: HTMLButtonElement[] = []

  const apply = (index: number, focus: boolean): void => {
    for (let i = 0; i < buttons.length; i += 1) {
      const selected = i === index
      const button = buttons[i] as HTMLButtonElement
      button.classList.toggle('pf-seg__btn--on', selected)
      button.setAttribute('aria-checked', String(selected))
      button.tabIndex = selected ? 0 : -1
    }
    if (focus) buttons[index]?.focus()
  }

  const select = (index: number, focus = false): void => {
    if (index === activeIndex && !focus) return
    activeIndex = index
    apply(index, focus)
    onChange(options[index]?.value as T)
  }

  options.forEach((option, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'pf-seg__btn'
    button.textContent = option.label
    button.title = `${label}: ${option.label}`
    button.dataset.value = String(option.value)
    button.tabIndex = index === activeIndex ? 0 : -1
    button.addEventListener('click', () => select(index))
    buttons.push(button)
    container.appendChild(button)
  })

  container.addEventListener('keydown', (event) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(event.key)) return
    event.preventDefault()
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
    select((activeIndex + delta + buttons.length) % buttons.length, true)
  })

  apply(activeIndex, false)

  return {
    el: container,
    setActive: (value: T) => {
      const index = options.findIndex((option) => option.value === value)
      if (index >= 0) select(index)
    },
  }
}

export function makeGroup(label: string): { wrapper: HTMLDivElement; row: HTMLDivElement } {
  const wrapper = document.createElement('div')
  wrapper.className = 'pf-group'
  const labelEl = document.createElement('span')
  labelEl.className = 'pf-group__label'
  labelEl.textContent = label
  wrapper.appendChild(labelEl)
  const row = document.createElement('div')
  row.className = 'pf-row'
  wrapper.appendChild(row)
  return { wrapper, row }
}

export function makeDivider(): HTMLDivElement {
  const divider = document.createElement('div')
  divider.className = 'pf-divider'
  divider.setAttribute('aria-hidden', 'true')
  return divider
}

export function iconEl(svg: string, title: string): HTMLSpanElement {
  const el = document.createElement('span')
  el.style.display = 'flex'
  el.innerHTML = svg
  el.setAttribute('aria-hidden', 'true')
  el.title = title
  return el
}