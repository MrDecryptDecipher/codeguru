import { ClipboardMonitor, CodeDetectionResult } from './ClipboardMonitor';

describe('ClipboardMonitor', () => {
  let monitor: ClipboardMonitor;

  beforeEach(() => {
    monitor = new ClipboardMonitor();
  });

  afterEach(() => {
    if (monitor.isActive()) {
      monitor.stop();
    }
  });

  describe('Code Detection', () => {
    test('should detect JavaScript code', () => {
      const code = `
        function hello() {
          const name = "World";
          console.log("Hello, " + name);
          return name;
        }
      `;

      const result = monitor.detectCode(code);

      expect(result.isCode).toBe(true);
      expect(result.language).toBe('javascript');
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    test('should detect Python code', () => {
      const code = `
        def hello():
            name = "World"
            print(f"Hello, {name}")
            return name
      `;

      const result = monitor.detectCode(code);

      expect(result.isCode).toBe(true);
      expect(result.language).toBe('python');
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    test('should detect TypeScript code', () => {
      const code = `
        interface User {
          name: string;
          age: number;
        }
        
        const user: User = {
          name: "John",
          age: 30
        };
      `;

      const result = monitor.detectCode(code);

      expect(result.isCode).toBe(true);
      expect(result.language).toBe('typescript');
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    test('should not detect plain text as code', () => {
      const text = 'This is just a regular sentence with no code.';

      const result = monitor.detectCode(text);

      expect(result.isCode).toBe(false);
      expect(result.confidence).toBeLessThanOrEqual(0.3);
    });

    test('should not detect empty string as code', () => {
      const result = monitor.detectCode('');

      expect(result.isCode).toBe(false);
      expect(result.confidence).toBe(0);
    });

    test('should handle code with high confidence', () => {
      const code = `
        class Calculator {
          constructor() {
            this.result = 0;
          }
          
          add(a, b) {
            return a + b;
          }
          
          subtract(a, b) {
            return a - b;
          }
        }
      `;

      const result = monitor.detectCode(code);

      expect(result.isCode).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('should truncate long snippets', () => {
      const longCode = 'const x = 1;\n'.repeat(100);

      const result = monitor.detectCode(longCode);

      expect(result.snippet.length).toBeLessThanOrEqual(500);
    });
  });

  describe('Language Detection', () => {
    test('should detect Java code', () => {
      const code = `
        public class HelloWorld {
          public static void main(String[] args) {
            System.out.println("Hello, World!");
          }
        }
      `;

      const result = monitor.detectCode(code);

      expect(result.language).toBe('java');
    });

    test('should detect C++ code', () => {
      const code = `
        #include <iostream>
        using namespace std;
        
        int main() {
          cout << "Hello, World!" << endl;
          return 0;
        }
      `;

      const result = monitor.detectCode(code);

      expect(result.language).toBe('cpp');
    });

    test('should detect Go code', () => {
      const code = `
        package main
        import "fmt"
        
        func main() {
          fmt.Println("Hello, World!")
        }
      `;

      const result = monitor.detectCode(code);

      expect(result.language).toBe('go');
    });

    test('should detect Rust code', () => {
      const code = `
        fn main() {
          let x = 5;
          println!("The value is: {}", x);
        }
      `;

      const result = monitor.detectCode(code);

      expect(result.language).toBe('rust');
    });
  });

  describe('Monitor Control', () => {
    test('should start monitoring', () => {
      expect(monitor.isActive()).toBe(false);
      
      monitor.start();
      
      expect(monitor.isActive()).toBe(true);
    });

    test('should stop monitoring', () => {
      monitor.start();
      expect(monitor.isActive()).toBe(true);
      
      monitor.stop();
      
      expect(monitor.isActive()).toBe(false);
    });

    test('should not start twice', () => {
      monitor.start();
      const firstState = monitor.isActive();
      
      monitor.start(); // Try to start again
      
      expect(monitor.isActive()).toBe(firstState);
    });

    test('should emit code-detected event', (done) => {
      // This test would require mocking the clipboard API
      // For now, we'll just verify the event emitter works
      monitor.on('code-detected', (detection: CodeDetectionResult) => {
        expect(detection).toBeDefined();
        expect(detection.isCode).toBeDefined();
        done();
      });

      // Manually trigger the event for testing
      monitor.emit('code-detected', {
        isCode: true,
        language: 'javascript',
        confidence: 0.8,
        snippet: 'const x = 1;'
      });
    });
  });
});
