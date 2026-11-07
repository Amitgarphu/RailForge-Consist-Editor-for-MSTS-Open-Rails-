/**
 * RailForge Consist - MSTS Parenthesis Tokenizer & AST Parser
 * @license Apache-2.0
 * 
 * Microsoft Train Simulator configuration files (.ENG, .WAG, .CON) follow a nested
 * S-expression like parenthesis format:
 * Token ( Value1 Value2 SubBlock ( ... ) )
 */

export interface MstsNode {
  name: string;
  values: string[];
  children: MstsNode[];
}

/**
 * Tokenize raw MSTS text, handling quotes, parentheses, and strip comments
 */
export function tokenizeMsts(rawContent: string): string[] {
  // Normalize line endings
  const content = rawContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const tokens: string[] = [];
  let i = 0;
  const len = content.length;

  while (i < len) {
    const ch = content[i];

    // Skip whitespace
    if (ch === ' ' || ch === '\t' || ch === '\n') {
      i++;
      continue;
    }

    // Skip MSTS single-line comment if begins with # or //
    if (ch === '#' || (ch === '/' && content[i + 1] === '/')) {
      while (i < len && content[i] !== '\n') {
        i++;
      }
      continue;
    }

    // Parentheses
    if (ch === '(' || ch === ')') {
      tokens.push(ch);
      i++;
      continue;
    }

    // Quoted string
    if (ch === '"') {
      let str = '';
      i++; // skip opening quote
      while (i < len && content[i] !== '"') {
        if (content[i] === '\\' && i + 1 < len) {
          str += content[i + 1];
          i += 2;
        } else {
          str += content[i];
          i++;
        }
      }
      i++; // skip closing quote
      tokens.push(str);
      continue;
    }

    // Unquoted token
    let token = '';
    while (
      i < len &&
      content[i] !== ' ' &&
      content[i] !== '\t' &&
      content[i] !== '\n' &&
      content[i] !== '(' &&
      content[i] !== ')' &&
      content[i] !== '"'
    ) {
      token += content[i];
      i++;
    }

    if (token.length > 0) {
      tokens.push(token);
    }
  }

  return tokens;
}

/**
 * Parse tokens into an MSTS Node tree
 */
export function parseMstsTokens(tokens: string[]): MstsNode[] {
  let index = 0;

  function parseBlock(): MstsNode | null {
    if (index >= tokens.length) return null;

    const name = tokens[index++];
    if (name === '(' || name === ')') {
      return null;
    }

    // Check if next token is '(' OR if this is a named MSTS block: Keyword Label '('
    let optionalLabel: string | undefined;
    if (
      index + 1 < tokens.length &&
      tokens[index] !== '(' &&
      tokens[index] !== ')' &&
      tokens[index + 1] === '(' &&
      /^(prim_state|matrix|anim_node|light_material|uv_op_copy|uv_op_reflectmap)$/i.test(name)
    ) {
      optionalLabel = tokens[index++];
    }

    if (index < tokens.length && tokens[index] === '(') {
      index++; // consume '('

      const values: string[] = optionalLabel ? [optionalLabel] : [];
      const children: MstsNode[] = [];

      while (index < tokens.length && tokens[index] !== ')') {
        // Skip comment or skip blocks inside MSTS
        const currentLower = tokens[index].toLowerCase();
        if (currentLower === 'comment' || currentLower === 'skip') {
          // Consume skip/comment block
          index++;
          if (index < tokens.length && tokens[index] === '(') {
            index++;
            let depth = 1;
            while (index < tokens.length && depth > 0) {
              if (tokens[index] === '(') depth++;
              else if (tokens[index] === ')') depth--;
              index++;
            }
          }
          continue;
        }

        // If next token after this one is '(', or it's a named MSTS block followed by Label '(', it's a child subblock
        const isDirectSubblock = index + 1 < tokens.length && tokens[index + 1] === '(';
        const isNamedSubblock =
          index + 2 < tokens.length &&
          tokens[index + 1] !== '(' &&
          tokens[index + 1] !== ')' &&
          tokens[index + 2] === '(' &&
          /^(prim_state|matrix|anim_node|light_material|uv_op_copy|uv_op_reflectmap)$/i.test(tokens[index]);

        if (isDirectSubblock || isNamedSubblock) {
          const child = parseBlock();
          if (child) {
            children.push(child);
          }
        } else {
          // Plain value
          values.push(tokens[index++]);
        }
      }

      if (index < tokens.length && tokens[index] === ')') {
        index++; // consume ')'
      }

      return { name, values, children };
    }

    // Bare token with no parenthesis block
    return { name, values: [], children: [] };
  }

  const rootNodes: MstsNode[] = [];
  while (index < tokens.length) {
    if (tokens[index] === ')') {
      index++;
      continue;
    }
    const node = parseBlock();
    if (node) {
      rootNodes.push(node);
    }
  }

  return rootNodes;
}

/**
 * Helper to recursively search an MSTS Node for a subnode by name (case-insensitive)
 */
export function findSubNode(node: MstsNode, targetName: string): MstsNode | undefined {
  const target = targetName.toLowerCase();
  for (const child of node.children) {
    if (child.name.toLowerCase() === target) {
      return child;
    }
  }
  for (const child of node.children) {
    const found = findSubNode(child, targetName);
    if (found) return found;
  }
  return undefined;
}

/**
 * Helper to get all subnodes with a specific name
 */
export function findAllSubNodes(node: MstsNode, targetName: string): MstsNode[] {
  const target = targetName.toLowerCase();
  const results: MstsNode[] = [];

  function traverse(n: MstsNode) {
    if (n.name.toLowerCase() === target) {
      results.push(n);
    }
    for (const child of n.children) {
      traverse(child);
    }
  }

  traverse(node);
  return results;
}
