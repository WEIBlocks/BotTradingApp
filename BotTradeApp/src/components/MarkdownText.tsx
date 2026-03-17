import React from 'react';
import {Text, View, StyleSheet} from 'react-native';

interface Props {
  text: string;
  baseStyle?: object;
}

// Lightweight markdown renderer for AI chat messages
// Supports: **bold**, *italic*, ### headers, - bullets, `code`, ```code blocks```
export default function MarkdownText({text, baseStyle}: Props) {
  // Strip strategy-json fenced blocks from display
  const cleaned = text.replace(/```strategy-json[\s\S]*?```/g, '').trim();

  // Split into blocks by double newline or code fences
  const blocks = splitBlocks(cleaned);

  return (
    <View>
      {blocks.map((block, i) => renderBlock(block, i, baseStyle))}
    </View>
  );
}

interface Block {
  type: 'paragraph' | 'heading' | 'bullet' | 'code' | 'numbered';
  level?: number; // heading level 1-3
  content: string;
}

function splitBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  // Split by code fences first
  const codeSplit = text.split(/(```[\s\S]*?```)/g);

  for (const segment of codeSplit) {
    if (segment.startsWith('```') && segment.endsWith('```')) {
      // Code block — strip fences and optional language tag
      const inner = segment.slice(3, -3).replace(/^\w*\n?/, '');
      blocks.push({type: 'code', content: inner.trim()});
      continue;
    }

    // Split remaining text into lines
    const lines = segment.split('\n');
    let currentParagraph: string[] = [];

    const flushParagraph = () => {
      if (currentParagraph.length > 0) {
        blocks.push({type: 'paragraph', content: currentParagraph.join(' ')});
        currentParagraph = [];
      }
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        flushParagraph();
        continue;
      }

      // Headings
      const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)/);
      if (headingMatch) {
        flushParagraph();
        blocks.push({type: 'heading', level: headingMatch[1].length, content: headingMatch[2]});
        continue;
      }

      // Bullet points
      if (/^[-*•]\s+/.test(trimmed)) {
        flushParagraph();
        blocks.push({type: 'bullet', content: trimmed.replace(/^[-*•]\s+/, '')});
        continue;
      }

      // Numbered lists
      const numberedMatch = trimmed.match(/^(\d+)[.)]\s+(.+)/);
      if (numberedMatch) {
        flushParagraph();
        blocks.push({type: 'numbered', content: numberedMatch[2], level: parseInt(numberedMatch[1], 10)});
        continue;
      }

      // Regular text — accumulate into paragraph
      currentParagraph.push(trimmed);
    }

    flushParagraph();
  }

  return blocks;
}

function renderBlock(block: Block, index: number, baseStyle?: object) {
  switch (block.type) {
    case 'heading':
      return (
        <Text key={index} style={[
          styles.heading,
          block.level === 1 && styles.h1,
          block.level === 2 && styles.h2,
          block.level === 3 && styles.h3,
          index > 0 && {marginTop: 12},
        ]}>
          {renderInlineFormatting(block.content)}
        </Text>
      );

    case 'bullet':
      return (
        <View key={index} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>{'\u2022'}</Text>
          <Text style={[styles.bodyText, baseStyle, {flex: 1}]}>
            {renderInlineFormatting(block.content)}
          </Text>
        </View>
      );

    case 'numbered':
      return (
        <View key={index} style={styles.bulletRow}>
          <Text style={styles.numberedLabel}>{block.level}.</Text>
          <Text style={[styles.bodyText, baseStyle, {flex: 1}]}>
            {renderInlineFormatting(block.content)}
          </Text>
        </View>
      );

    case 'code':
      return (
        <View key={index} style={styles.codeBlock}>
          <Text style={styles.codeText}>{block.content}</Text>
        </View>
      );

    case 'paragraph':
    default:
      if (!block.content.trim()) return null;
      return (
        <Text key={index} style={[styles.bodyText, baseStyle, index > 0 && {marginTop: 8}]}>
          {renderInlineFormatting(block.content)}
        </Text>
      );
  }
}

// Parse inline formatting: **bold**, *italic*, `code`
function renderInlineFormatting(text: string): React.ReactNode[] {
  // Regex to match **bold**, *italic*, `code`
  const parts: React.ReactNode[] = [];
  // Combined regex: **bold**, *italic*, `code`
  const regex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Push text before this match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      // **bold**
      parts.push(
        <Text key={`b${match.index}`} style={styles.bold}>{match[2]}</Text>,
      );
    } else if (match[4]) {
      // *italic*
      parts.push(
        <Text key={`i${match.index}`} style={styles.italic}>{match[4]}</Text>,
      );
    } else if (match[6]) {
      // `code`
      parts.push(
        <Text key={`c${match.index}`} style={styles.inlineCode}>{match[6]}</Text>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Push remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

const styles = StyleSheet.create({
  heading: {
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  h1: {fontSize: 18, lineHeight: 24},
  h2: {fontSize: 16, lineHeight: 22},
  h3: {fontSize: 15, lineHeight: 20},
  bodyText: {
    fontFamily: 'Inter-Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 21,
  },
  bold: {
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
  },
  italic: {
    fontFamily: 'Inter-Regular',
    fontStyle: 'italic',
  },
  inlineCode: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: '#10B981',
    backgroundColor: 'rgba(16,185,129,0.12)',
    paddingHorizontal: 4,
    borderRadius: 3,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 4,
    paddingLeft: 4,
  },
  bulletDot: {
    fontFamily: 'Inter-Bold',
    fontSize: 14,
    color: '#10B981',
    marginRight: 8,
    lineHeight: 21,
  },
  numberedLabel: {
    fontFamily: 'Inter-SemiBold',
    fontSize: 14,
    color: '#10B981',
    marginRight: 8,
    lineHeight: 21,
    minWidth: 18,
  },
  codeBlock: {
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    marginBottom: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 18,
  },
});
