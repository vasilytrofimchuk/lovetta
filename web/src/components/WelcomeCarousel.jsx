import { useEffect, useRef, useState } from 'react'
import api from '../lib/api'

const AUTO_SCROLL_SPEED = 0.4
const AUTO_SCROLL_RESUME_DELAY = 5000
const ACTIVE_INIT_DELAY = 300
const CARD_GAP_PX = 12

function shuffleTemplates(list) {
  const next = [...list]
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = next[i]
    next[i] = next[j]
    next[j] = tmp
  }
  return next
}

function mixTemplatesByStyle(list) {
  const anime = shuffleTemplates(list.filter(template => template.style === 'anime'))
  const real = shuffleTemplates(list.filter(template => template.style !== 'anime'))

  if (!anime.length || !real.length) {
    return shuffleTemplates(list)
  }

  const mixed = []

  while (real.length || anime.length) {
    if (real.length) mixed.push(real.shift())
    if (anime.length) mixed.push(anime.shift())
  }

  return mixed
}

function WelcomeCarouselCard({ template, active, setRef, copyKind }) {
  const videoRef = useRef(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (active) {
      video.play().catch(() => {})
      return
    }

    video.pause()
    video.currentTime = 0
  }, [active])

  return (
    <article
      ref={setRef}
      data-testid="welcome-card"
      data-active={active ? 'true' : 'false'}
      data-copy={copyKind}
      data-style={template.style === 'anime' ? 'anime' : 'real'}
      className={`relative w-40 shrink-0 overflow-hidden rounded-2xl border-2 bg-brand-card transition-[border-color,transform,box-shadow] duration-300 ${
        active
          ? 'border-brand-accent scale-[1.04] shadow-[0_0_20px_rgba(214,51,108,0.28)]'
          : 'border-transparent'
      }`}
      style={{ aspectRatio: '3 / 4' }}
    >
      <img
        src={template.avatar_url}
        alt={template.name}
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
      />

      {template.video_url && (
        <video
          ref={videoRef}
          src={template.video_url}
          muted
          loop
          playsInline
          preload="none"
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
            active ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent p-3">
        <div className="mb-0.5 flex items-baseline gap-1.5">
          <span className="text-base font-bold text-white">{template.name}</span>
          {template.age ? (
            <span className="text-sm font-semibold text-brand-accent">{template.age}</span>
          ) : null}
        </div>
        {template.tagline ? (
          <p
            className="overflow-hidden text-xs leading-[1.3] text-white/70"
            style={{
              display: '-webkit-box',
              WebkitBoxOrient: 'vertical',
              WebkitLineClamp: 2,
            }}
          >
            {template.tagline}
          </p>
        ) : null}
      </div>
    </article>
  )
}

export default function WelcomeCarousel() {
  const viewportRef = useRef(null)
  const trackRef = useRef(null)
  const sequenceRef = useRef(null)
  const rafRef = useRef(0)
  const pauseTimeoutRef = useRef(0)
  const initTimeoutRef = useRef(0)
  const pausedRef = useRef(false)
  const offsetRef = useRef(0)
  const loopWidthRef = useRef(0)
  const activeIndexRef = useRef(-1)
  const cardRefs = useRef([])
  const [templates, setTemplates] = useState([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ignore = false

    api.get('/api/companions/templates/preview')
      .then(({ data }) => {
        if (ignore) return
        const nextTemplates = mixTemplatesByStyle(
          (data.templates || []).filter(template => template.avatar_url)
        )
        setTemplates(nextTemplates)
      })
      .catch(() => {})
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    const viewport = viewportRef.current
    const track = trackRef.current
    if (!viewport || !track || templates.length === 0) return

    cardRefs.current = cardRefs.current.slice(0, templates.length * 2)
    offsetRef.current = 0

    function measureLoopWidth() {
      const sequence = sequenceRef.current
      if (!sequence) return

      loopWidthRef.current = sequence.getBoundingClientRect().width + CARD_GAP_PX
    }

    function applyOffset() {
      track.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`
    }

    function updateActiveCard() {
      if (!viewportRef.current) return

      const viewportRect = viewport.getBoundingClientRect()
      const viewportCenter = viewportRect.left + (viewportRect.width / 2)

      let nextActiveIndex = -1
      let closestDistance = Infinity

      cardRefs.current.forEach((card, index) => {
        if (!card) return
        const rect = card.getBoundingClientRect()
        const cardCenter = rect.left + (rect.width / 2)
        const distance = Math.abs(cardCenter - viewportCenter)

        if (distance < closestDistance) {
          closestDistance = distance
          nextActiveIndex = index
        }
      })

      if (nextActiveIndex !== -1 && nextActiveIndex !== activeIndexRef.current) {
        activeIndexRef.current = nextActiveIndex
        setActiveIndex(nextActiveIndex)
      }
    }

    function autoScroll() {
      if (!viewportRef.current || !trackRef.current) return

      if (!pausedRef.current && templates.length > 1) {
        const loopWidth = loopWidthRef.current
        if (loopWidth > 0) {
          offsetRef.current += AUTO_SCROLL_SPEED
          if (offsetRef.current >= loopWidth) {
            offsetRef.current -= loopWidth
          }
          applyOffset()
          updateActiveCard()
        }
      }

      rafRef.current = window.requestAnimationFrame(autoScroll)
    }

    function pauseAutoScroll() {
      pausedRef.current = true
      window.clearTimeout(pauseTimeoutRef.current)
      pauseTimeoutRef.current = window.setTimeout(() => {
        pausedRef.current = false
      }, AUTO_SCROLL_RESUME_DELAY)
    }

    viewport.addEventListener('touchstart', pauseAutoScroll, { passive: true })
    viewport.addEventListener('mousedown', pauseAutoScroll)
    window.addEventListener('resize', measureLoopWidth)

    initTimeoutRef.current = window.setTimeout(() => {
      measureLoopWidth()
      applyOffset()
      updateActiveCard()
      rafRef.current = window.requestAnimationFrame(autoScroll)
    }, ACTIVE_INIT_DELAY)

    return () => {
      window.cancelAnimationFrame(rafRef.current)
      window.clearTimeout(pauseTimeoutRef.current)
      window.clearTimeout(initTimeoutRef.current)
      viewport.removeEventListener('touchstart', pauseAutoScroll)
      viewport.removeEventListener('mousedown', pauseAutoScroll)
      window.removeEventListener('resize', measureLoopWidth)
    }
  }, [templates])

  if (loading || templates.length === 0) {
    return (
      <div className="mx-[-20px] mb-6 px-5">
        <div className="flex min-h-[220px] items-center justify-center">
          <div className="flex aspect-[3/4] w-40 items-center justify-center rounded-2xl border border-brand-border bg-brand-card">
            <div className="h-8 w-8 rounded-full border-2 border-brand-accent border-t-transparent animate-spin" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <section className="mx-[-20px] mb-6" aria-label="Featured girlfriends">
      <div
        ref={viewportRef}
        data-testid="welcome-carousel-viewport"
        className="overflow-hidden px-5"
      >
        <div
          ref={trackRef}
          data-testid="welcome-carousel-track"
          className="flex gap-3 will-change-transform"
        >
          {[0, 1].map((copyIndex) => (
            <div
              key={copyIndex}
              ref={copyIndex === 0 ? sequenceRef : undefined}
              className="flex shrink-0 gap-3"
            >
              {templates.map((template, index) => {
                const renderedIndex = (copyIndex * templates.length) + index
                return (
                  <WelcomeCarouselCard
                    key={`${copyIndex}-${template.name}-${template.avatar_url}-${index}`}
                    template={template}
                    active={renderedIndex === activeIndex}
                    copyKind={copyIndex === 0 ? 'primary' : 'clone'}
                    setRef={(node) => {
                      cardRefs.current[renderedIndex] = node
                    }}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
