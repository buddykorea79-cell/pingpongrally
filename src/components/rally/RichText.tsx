import { Fragment } from 'react'
import { splitLinks, splitMentions } from '@/lib/rally'
import { cn } from '@/lib/utils'

/** 사용자 글은 HTML 로 렌더링하지 않는다. 링크와 @멘션만 안전하게 꾸민다. */
export function RichText({ text, className, mentionClass }: { text: string; className?: string; mentionClass?: string }) {
  return (
    <p className={cn('user-text', className)}>
      {splitLinks(text).map((part, i) =>
        part.href ? (
          <a
            key={i}
            href={part.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="break-all font-medium text-pong-600 underline decoration-pong-300 underline-offset-2 hover:decoration-pong-500 dark:text-pong-300"
            onClick={(e) => e.stopPropagation()}
          >
            {part.text}
          </a>
        ) : (
          <Fragment key={i}>
            {splitMentions(part.text).map((m, j) =>
              m.mention ? (
                <span key={j} className={cn('font-semibold text-reply-600 dark:text-reply-400', mentionClass)}>
                  {m.text}
                </span>
              ) : (
                <Fragment key={j}>{m.text}</Fragment>
              ),
            )}
          </Fragment>
        ),
      )}
    </p>
  )
}
