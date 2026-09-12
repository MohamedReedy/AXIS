import React, { useMemo } from 'react';
import katex from 'katex';

interface MathTextProps {
  content?: string | null;
  className?: string;
}

export const MathText: React.FC<MathTextProps> = ({ content, className = '' }) => {
  if (!content) return null;

  // Segment content into text and LaTeX math blocks:
  // - $$...$$ or \[...\] for display math
  // - $...$ or \(...\) for inline math
  const elements = useMemo(() => {
    const tokens: Array<{ type: 'text' | 'inline-math' | 'display-math'; value: string }> = [];
    const regex = /(\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|\$(?:\\\$|[^\$\n])+\$|\\\([\s\S]*?\\\))/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        tokens.push({
          type: 'text',
          value: content.slice(lastIndex, match.index),
        });
      }

      const raw = match[0];
      if (raw.startsWith('$$') && raw.endsWith('$$')) {
        tokens.push({
          type: 'display-math',
          value: raw.slice(2, -2).trim(),
        });
      } else if (raw.startsWith('\\[') && raw.endsWith('\\]')) {
        tokens.push({
          type: 'display-math',
          value: raw.slice(2, -2).trim(),
        });
      } else if (raw.startsWith('\\(') && raw.endsWith('\\)')) {
        tokens.push({
          type: 'inline-math',
          value: raw.slice(2, -2).trim(),
        });
      } else if (raw.startsWith('$') && raw.endsWith('$')) {
        tokens.push({
          type: 'inline-math',
          value: raw.slice(1, -1).trim(),
        });
      }

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < content.length) {
      tokens.push({
        type: 'text',
        value: content.slice(lastIndex),
      });
    }

    return tokens;
  }, [content]);

  return (
    <span className={`inline ${className}`}>
      {elements.map((token, index) => {
        if (token.type === 'text') {
          return <React.Fragment key={index}>{token.value}</React.Fragment>;
        }

        try {
          const html = katex.renderToString(token.value, {
            displayMode: token.type === 'display-math',
            throwOnError: false,
          });

          if (token.type === 'display-math') {
            return (
              <span
                key={index}
                className="my-3 block overflow-x-auto py-1 text-center font-normal"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          }

          return (
            <span
              key={index}
              className="inline-block px-1 align-baseline font-normal"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          );
        } catch {
          return <code key={index} className="text-xs bg-slate-100 px-1 py-0.5 rounded font-mono">{token.value}</code>;
        }
      })}
    </span>
  );
};
