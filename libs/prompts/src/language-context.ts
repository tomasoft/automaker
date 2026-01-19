/**
 * Language-Specific Context System
 *
 * Automatically injects expert-level knowledge for different languages and frameworks
 * based on project type detection. This replaces the need for exhaustive checklists.
 */

export interface LanguageContext {
  language: string;
  framework?: string;
  bestPractices: string;
  commonPitfalls: string;
  testingGuidance: string;
  errorPatterns: ErrorPattern[];
}

export interface ErrorPattern {
  /** Error code or pattern (e.g., "CS1009", "TS2304") */
  pattern: string;
  /** Human-readable explanation */
  explanation: string;
  /** How to fix it */
  solution: string;
  /** Example of correct code */
  example?: string;
}

/**
 * C# / .NET Context
 */
export const CSHARP_CONTEXT: LanguageContext = {
  language: 'C#',
  framework: '.NET',
  bestPractices: `## C# Best Practices

### String Handling
- **Verbatim strings**: Use \`@"..."\` for file paths, regex, and any string with backslashes
- **String interpolation**: Use \`$"Value: {variable}"\` instead of concatenation
- **StringBuilder**: Use for string building in loops

### Async/Await
- Methods returning \`Task\` should be suffixed with \`Async\`
- Always \`await\` async calls, don't block with \`.Result\` or \`.Wait()\`
- Use \`ConfigureAwait(false)\` in library code

### Resource Management
- Implement \`IDisposable\` for unmanaged resources
- Use \`using\` statements or declarations for disposal
- Don't forget to dispose \`HttpClient\`, \`Stream\`, etc.

### Modern C# Features
- Use pattern matching where appropriate
- Prefer \`record\` types for DTOs
- Use nullable reference types (\`string?\`)
- Use \`required\` for mandatory properties

### Testing
- Use xUnit with \`[Fact]\` and \`[Theory]\` attributes
- Follow Arrange-Act-Assert pattern
- Test file naming: \`ClassNameTests.cs\`
- One test class per production class`,

  commonPitfalls: `## Common C# Pitfalls to AVOID

❌ **Forgetting @ prefix for regex/paths**
\`\`\`csharp
// WRONG - causes CS1009 errors
var regex = new Regex("[0-9]+");
var path = "C:\\Users\\file.txt";

// CORRECT
var regex = new Regex(@"[0-9]+");
var path = @"C:\\Users\\file.txt";
\`\`\`

❌ **Not disposing IDisposable**
\`\`\`csharp
// WRONG
var client = new HttpClient();
var response = client.GetAsync(url);

// CORRECT
using var client = new HttpClient();
var response = await client.GetAsync(url);
\`\`\`

❌ **Blocking async calls**
\`\`\`csharp
// WRONG - causes deadlocks
var result = SomeAsyncMethod().Result;

// CORRECT
var result = await SomeAsyncMethod();
\`\`\`

❌ **String concatenation in loops**
\`\`\`csharp
// WRONG - creates many string objects
string result = "";
foreach (var item in items) {
    result += item;
}

// CORRECT
var sb = new StringBuilder();
foreach (var item in items) {
    sb.Append(item);
}
var result = sb.ToString();
\`\`\``,

  testingGuidance: `## C# Testing Guidance

### xUnit Test Structure
\`\`\`csharp
public class CalculatorTests
{
    [Fact]
    public void Add_TwoPositiveNumbers_ReturnsSum()
    {
        // Arrange
        var calculator = new Calculator();
        
        // Act
        var result = calculator.Add(2, 3);
        
        // Assert
        Assert.Equal(5, result);
    }
    
    [Theory]
    [InlineData(1, 1, 2)]
    [InlineData(2, 3, 5)]
    [InlineData(-1, 1, 0)]
    public void Add_VariousInputs_ReturnsCorrectSum(int a, int b, int expected)
    {
        var calculator = new Calculator();
        Assert.Equal(expected, calculator.Add(a, b));
    }
}
\`\`\`

### Regex Testing (ALWAYS use @ prefix)
\`\`\`csharp
[Fact]
public void Password_ContainsDigits_PassesValidation()
{
    var password = "abc123";
    Assert.Matches(@"[0-9]+", password); // ← ALWAYS use @ prefix
}
\`\`\`

### Test Quality Requirements
**CRITICAL - Tests must be thorough, not superficial:**

❌ **NEVER write placeholder tests:**
\`\`\`csharp
// WRONG - Useless placeholder
[Fact]
public void TestSomething()
{
    Assert.True(true); // Replace with actual assertions
}
\`\`\`

✅ **DO write comprehensive tests that validate ALL requirements:**
\`\`\`csharp
// CORRECT - Tests actual behavior from requirements
[Fact]
public void GeneratePassword_ExcludesRestrictedCharacter_B()
{
    var generator = new PasswordGenerator();
    var password = generator.GeneratePassword(15, true, true, true, true);
    Assert.DoesNotContain('B', password); // Validates spec requirement
}

[Theory]
[InlineData(5)]  // Too short
[InlineData(25)] // Too long
public void GeneratePassword_InvalidLength_ThrowsException(int invalidLength)
{
    var generator = new PasswordGenerator();
    Assert.Throws<ArgumentException>(() => 
        generator.GeneratePassword(invalidLength, true, true, true, true)
    );
}
\`\`\`

### Test Coverage Checklist
For EVERY feature, write tests for:
1. ✅ Happy path (normal valid inputs)
2. ✅ Edge cases (boundary values, empty inputs, null)
3. ✅ Error cases (invalid inputs that should throw exceptions)
4. ✅ ALL acceptance criteria from specification
5. ✅ All exclusion rules (if spec says "exclude X", test that X is excluded)

**If your test has a comment "Replace with actual assertions", DELETE THE TEST and write a real one.**

### Project Structure
- Main project: \`ProjectName/ClassName.cs\`
- Test project: \`ProjectName.Tests/ClassNameTests.cs\`
- Test project must reference main project
- Both must target same framework (net10.0)`,

  errorPatterns: [
    {
      pattern: 'CS1009',
      explanation: 'Unrecognized escape sequence in string literal',
      solution: 'Add @ prefix to make it a verbatim string',
      example: 'Use @"[a-z]+" instead of "[a-z]+"',
    },
    {
      pattern: 'CS0246',
      explanation: 'Type or namespace not found',
      solution: 'Add using directive or project reference',
      example: 'Add "using ProjectName;" or dotnet add reference',
    },
    {
      pattern: 'CS0103',
      explanation: 'Name does not exist in current context',
      solution: 'Check variable name spelling and scope',
    },
    {
      pattern: 'CS0029',
      explanation: 'Cannot implicitly convert type',
      solution: 'Add explicit cast or fix type mismatch',
    },
    {
      pattern: 'NU1201',
      explanation: 'Project is not compatible with target framework',
      solution: 'Update both projects to same framework version',
      example: 'Use net10.0 for ALL projects in solution',
    },
  ],
};

/**
 * TypeScript / React Context
 */
export const TYPESCRIPT_REACT_CONTEXT: LanguageContext = {
  language: 'TypeScript',
  framework: 'React',
  bestPractices: `## TypeScript + React Best Practices

### Component Structure
- Use functional components with hooks (not class components)
- Define prop types with interfaces: \`interface Props { ... }\`
- Use \`React.FC<Props>\` or explicit return type
- Extract complex logic into custom hooks

### State Management
- Use \`useState\` for local state
- Use \`useContext\` for shared state
- Consider Zustand or Redux for complex state
- Don't overuse state - derive when possible

### Type Safety
- Define strict prop interfaces
- Use discriminated unions for variants
- Avoid \`any\` - use \`unknown\` if needed
- Enable strict mode in tsconfig.json

### Performance
- Memoize expensive computations with \`useMemo\`
- Memoize callbacks with \`useCallback\`
- Use \`React.memo\` for component memoization
- Lazy load routes and heavy components

### Testing
- Use Vitest + React Testing Library
- Test user interactions, not implementation
- Mock API calls with MSW
- Test accessibility with jest-axe`,

  commonPitfalls: `## Common TypeScript/React Pitfalls

❌ **Missing dependencies in useEffect**
\`\`\`tsx
// WRONG - stale closure
useEffect(() => {
  console.log(count); // might be stale
}, []); // missing count dependency

// CORRECT
useEffect(() => {
  console.log(count);
}, [count]);
\`\`\`

❌ **Not handling async state updates**
\`\`\`tsx
// WRONG - race condition
const [data, setData] = useState(null);
useEffect(() => {
  fetchData().then(setData);
}, []);

// CORRECT - cleanup on unmount
useEffect(() => {
  let cancelled = false;
  fetchData().then(result => {
    if (!cancelled) setData(result);
  });
  return () => { cancelled = true; };
}, []);
\`\`\`

❌ **Mutating state directly**
\`\`\`tsx
// WRONG
items.push(newItem);
setItems(items);

// CORRECT
setItems([...items, newItem]);
\`\`\``,

  testingGuidance: `## React Testing Guidance

\`\`\`tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

describe('Counter', () => {
  it('increments count when button clicked', () => {
    render(<Counter />);
    const button = screen.getByRole('button', { name: /increment/i });
    fireEvent.click(button);
    expect(screen.getByText('Count: 1')).toBeInTheDocument();
  });
});
\`\`\``,

  errorPatterns: [
    {
      pattern: 'TS2304',
      explanation: 'Cannot find name',
      solution: 'Import the type/value or check spelling',
    },
    {
      pattern: 'TS2339',
      explanation: 'Property does not exist on type',
      solution: 'Add property to interface or use optional chaining',
    },
    {
      pattern: 'TS2322',
      explanation: 'Type is not assignable',
      solution: 'Fix type mismatch or add type assertion',
    },
  ],
};

/**
 * Python Context
 */
export const PYTHON_CONTEXT: LanguageContext = {
  language: 'Python',
  bestPractices: `## Python Best Practices

### Code Style (PEP 8)
- Use 4 spaces for indentation (not tabs)
- Function names: \`snake_case\`
- Class names: \`PascalCase\`
- Constants: \`UPPER_SNAKE_CASE\`
- Max line length: 88 characters (Black formatter)

### Type Hints
- Add type hints for function signatures
- Use \`from typing import List, Dict, Optional\`
- Enable mypy for type checking
- Use \`TypedDict\` for structured dicts

### Modern Python
- Use f-strings: \`f"Hello {name}"\`
- Use pathlib instead of os.path
- Use dataclasses for data containers
- List/dict comprehensions over loops

### Error Handling
- Be specific with exceptions
- Use context managers (\`with\`)
- Don't catch bare \`except:\`
- Log errors with logging module

### Testing
- Use pytest (not unittest)
- Test files: \`test_*.py\`
- Use fixtures for setup
- Parametrize tests with \`@pytest.mark.parametrize\``,

  commonPitfalls: `## Common Python Pitfalls

❌ **Mutable default arguments**
\`\`\`python
# WRONG - shared across calls
def append_to(item, lst=[]):
    lst.append(item)
    return lst

# CORRECT
def append_to(item, lst=None):
    if lst is None:
        lst = []
    lst.append(item)
    return lst
\`\`\`

❌ **Not closing files**
\`\`\`python
# WRONG
f = open('file.txt')
data = f.read()

# CORRECT
with open('file.txt') as f:
    data = f.read()
\`\`\``,

  testingGuidance: `## Python Testing Guidance

\`\`\`python
import pytest

def test_add():
    assert add(2, 3) == 5

@pytest.mark.parametrize("a,b,expected", [
    (1, 1, 2),
    (2, 3, 5),
    (-1, 1, 0),
])
def test_add_parametrized(a, b, expected):
    assert add(a, b) == expected
\`\`\``,

  errorPatterns: [
    {
      pattern: 'IndentationError',
      explanation: 'Inconsistent indentation',
      solution: 'Use 4 spaces consistently, not tabs',
    },
    {
      pattern: 'NameError',
      explanation: 'Variable not defined',
      solution: 'Check spelling and scope',
    },
    {
      pattern: 'AttributeError',
      explanation: 'Object has no attribute',
      solution: 'Check object type and available methods',
    },
  ],
};

/**
 * SQL Context
 */
export const SQL_CONTEXT: LanguageContext = {
  language: 'SQL',
  bestPractices: `## SQL Best Practices

### Query Style
- Use UPPERCASE for keywords: SELECT, FROM, WHERE
- Use lowercase for table/column names
- Indent subqueries and joins
- Use meaningful table aliases

### Performance
- Use indexes on WHERE/JOIN columns
- Avoid SELECT * in production
- Use LIMIT/TOP for testing
- Analyze query plans (EXPLAIN)

### Security
- **ALWAYS use parameterized queries**
- Never concatenate user input into SQL
- Use ORM query builders when possible
- Validate and sanitize all inputs

### Transactions
- Use transactions for multi-statement operations
- Keep transactions short
- Handle rollback on errors
- Set appropriate isolation levels`,

  commonPitfalls: `## Common SQL Pitfalls

❌ **SQL Injection vulnerability**
\`\`\`sql
-- WRONG - NEVER DO THIS
SELECT * FROM users WHERE id = '$userId'

-- CORRECT - use parameterized queries
SELECT * FROM users WHERE id = @userId
\`\`\`

❌ **Missing JOIN conditions**
\`\`\`sql
-- WRONG - Cartesian product
SELECT * FROM users, orders

-- CORRECT
SELECT * FROM users
INNER JOIN orders ON users.id = orders.user_id
\`\`\`

❌ **N+1 query problem**
\`\`\`sql
-- WRONG - one query per user
for user in users:
    orders = query("SELECT * FROM orders WHERE user_id = ?", user.id)

-- CORRECT - single JOIN query
SELECT users.*, orders.*
FROM users
LEFT JOIN orders ON users.id = orders.user_id
\`\`\``,

  testingGuidance: `## SQL Testing Guidance

- Test with realistic data volumes
- Test edge cases (NULL values, empty strings)
- Verify indexes are used (EXPLAIN PLAN)
- Test concurrent access scenarios
- Use transaction rollback for tests`,

  errorPatterns: [],
};

/**
 * Language context registry
 */
export const LANGUAGE_CONTEXTS: Record<string, LanguageContext> = {
  csharp: CSHARP_CONTEXT,
  typescript: TYPESCRIPT_REACT_CONTEXT,
  python: PYTHON_CONTEXT,
  sql: SQL_CONTEXT,
};

/**
 * Detect primary language(s) from project files
 */
export interface ProjectLanguage {
  primary: string;
  secondary?: string[];
  framework?: string;
}

export function detectProjectLanguages(files: string[]): ProjectLanguage | null {
  const extensions = files
    .map((f) => {
      const match = f.match(/\.([^.]+)$/);
      return match ? match[1] : null;
    })
    .filter(Boolean);

  const extCounts = extensions.reduce(
    (acc, ext) => {
      acc[ext!] = (acc[ext!] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  // Detect .NET
  if (files.some((f) => f.endsWith('.csproj') || f.endsWith('.sln'))) {
    return { primary: 'csharp', framework: '.NET' };
  }

  // Detect React/TypeScript
  if (files.some((f) => f.includes('package.json'))) {
    const hasTsx = files.some((f) => f.endsWith('.tsx'));
    const hasTs = files.some((f) => f.endsWith('.ts'));
    if (hasTsx || hasTs) {
      return {
        primary: 'typescript',
        framework: hasTsx ? 'React' : undefined,
      };
    }
  }

  // Detect Python
  if (
    files.some(
      (f) =>
        f.endsWith('requirements.txt') || f.endsWith('setup.py') || f.endsWith('pyproject.toml')
    )
  ) {
    return { primary: 'python' };
  }

  // Fall back to most common extension
  const sortedExts = Object.entries(extCounts).sort((a, b) => b[1] - a[1]);
  if (sortedExts.length > 0) {
    const ext = sortedExts[0][0];
    const langMap: Record<string, string> = {
      cs: 'csharp',
      ts: 'typescript',
      tsx: 'typescript',
      py: 'python',
      sql: 'sql',
    };
    const lang = langMap[ext];
    if (lang) {
      return { primary: lang };
    }
  }

  return null;
}

/**
 * Build language-aware context string to inject into system prompt
 */
export function buildLanguageContext(languages: string[]): string {
  if (languages.length === 0) return '';

  const contexts = languages.map((lang) => LANGUAGE_CONTEXTS[lang.toLowerCase()]).filter(Boolean);

  if (contexts.length === 0) return '';

  let result = '\n\n## 🎯 LANGUAGE-SPECIFIC EXPERTISE\n\n';
  result += 'You are now operating in expert mode for the following languages:\n\n';

  for (const ctx of contexts) {
    result += `### ${ctx.language}${ctx.framework ? ` (${ctx.framework})` : ''}\n\n`;
    result += ctx.bestPractices + '\n\n';
    result += ctx.commonPitfalls + '\n\n';
    result += ctx.testingGuidance + '\n\n';

    if (ctx.errorPatterns.length > 0) {
      result += `#### Error Recovery Patterns\n\n`;
      for (const pattern of ctx.errorPatterns) {
        result += `**${pattern.pattern}**: ${pattern.explanation}\n`;
        result += `- Solution: ${pattern.solution}\n`;
        if (pattern.example) {
          result += `- Example: ${pattern.example}\n`;
        }
        result += '\n';
      }
    }
  }

  result += `\n**CRITICAL**: When you encounter errors specific to these languages, apply the solutions above IMMEDIATELY. Don't iterate 10 times on the same error - fix it correctly the first time.\n\n`;

  return result;
}
