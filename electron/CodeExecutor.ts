import { spawn, exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { v4 as uuidv4 } from 'uuid';

export interface ExecutionResult {
  success: boolean;
  output: string;
  error: string;
  exitCode: number;
  executionTime: number;
  memoryUsage?: number;
}

export interface TestCase {
  input: string;
  expectedOutput: string;
  description?: string;
}

export interface TestResult {
  testCase: TestCase;
  passed: boolean;
  actualOutput: string;
  error?: string;
  executionTime: number;
}

export class CodeExecutor {
  private tempDir: string;
  private maxExecutionTime: number = 10000; // 10 seconds
  private maxMemoryMB: number = 256;

  constructor() {
    this.tempDir = path.join(app.getPath('userData'), 'code_executions');
    this.ensureTempDirectory();
  }

  private ensureTempDirectory(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Execute Python code
   */
  async executePython(code: string, input?: string): Promise<ExecutionResult> {
    const fileId = uuidv4();
    const codeFile = path.join(this.tempDir, `${fileId}.py`);
    const inputFile = input ? path.join(this.tempDir, `${fileId}.input`) : null;

    try {
      // Write code to file
      fs.writeFileSync(codeFile, code, 'utf-8');

      // Write input if provided
      if (input && inputFile) {
        fs.writeFileSync(inputFile, input, 'utf-8');
      }

      // Execute Python
      const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
      return await this.executeCommand(
        pythonCommand,
        [codeFile],
        input,
        this.maxExecutionTime
      );
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        exitCode: -1,
        executionTime: 0
      };
    } finally {
      // Cleanup
      this.cleanupFile(codeFile);
      if (inputFile) this.cleanupFile(inputFile);
    }
  }

  /**
   * Execute JavaScript/Node.js code
   */
  async executeJavaScript(code: string, input?: string): Promise<ExecutionResult> {
    const fileId = uuidv4();
    const codeFile = path.join(this.tempDir, `${fileId}.js`);
    const inputFile = input ? path.join(this.tempDir, `${fileId}.input`) : null;

    try {
      // Write code to file
      fs.writeFileSync(codeFile, code, 'utf-8');

      // Write input if provided
      if (input && inputFile) {
        fs.writeFileSync(inputFile, input, 'utf-8');
      }

      // Execute Node.js
      return await this.executeCommand(
        'node',
        [codeFile],
        input,
        this.maxExecutionTime
      );
    } catch (error) {
      return {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : String(error),
        exitCode: -1,
        executionTime: 0
      };
    } finally {
      // Cleanup
      this.cleanupFile(codeFile);
      if (inputFile) this.cleanupFile(inputFile);
    }
  }

  /**
   * Execute code with test cases
   */
  /**
   * Execute code with test cases
   */
  async runTests(
    code: string,
    testCases: TestCase[],
    language: 'python' | 'javascript' = 'python'
  ): Promise<TestResult[]> {
    const results: TestResult[] = [];

    for (const testCase of testCases) {
      const startTime = Date.now();
      let result: ExecutionResult;

      try {
        if (language === 'python') {
          // DYNAMIC DRIVER GENERATION
          // If the code is a Solution class without a driver, wrap it.
          if (code.includes("class Solution:") && !code.includes("if __name__ == \"__main__\":")) {
            const driverCode = this.generatePythonDriver(code, testCase.input);
            // Execute without passing input as stdin, because it's embedded in the driver
            result = await this.executePython(driverCode);
          } else {
            result = await this.executePython(code, testCase.input);
          }
        } else {
          result = await this.executeJavaScript(code, testCase.input);
        }

        const executionTime = Date.now() - startTime;
        const actualOutput = result.output.trim();
        const expectedOutput = testCase.expectedOutput.trim();

        results.push({
          testCase,
          passed: actualOutput === expectedOutput,
          actualOutput,
          error: result.success ? undefined : result.error,
          executionTime
        });
      } catch (error) {
        results.push({
          testCase,
          passed: false,
          actualOutput: '',
          error: error instanceof Error ? error.message : String(error),
          executionTime: Date.now() - startTime
        });
      }
    }

    return results;
  }

  private extractFunctionName(code: string): string {
    // Look for the function definition inside the Solution class
    const match = code.match(/class\s+Solution:[\s\S]*?def\s+([a-zA-Z0-9_]+)\s*\(/);
    if (match) {
      return match[1];
    }
    // Fallback: Look for any top-level function if class isn't strict
    const simpleMatch = code.match(/def\s+([a-zA-Z0-9_]+)\s*\(/);
    return simpleMatch ? simpleMatch[1] : "solve";
  }

  private generatePythonDriver(userSolution: string, input: string): string {
    const funcName = this.extractFunctionName(userSolution);

    // Robust driver that handles imports and calling the method
    return `
import sys
import json
from typing import *
import collections
import math
import itertools
import functools
import heapq
import bisect

# Common LeetCode imports
List = List
Optional = Optional

# Mock ListNode/TreeNode if not present to prevent errors
if 'ListNode' not in locals():
    class ListNode:
        def __init__(self, val=0, next=None):
            self.val = val
            self.next = next

if 'TreeNode' not in locals():
    class TreeNode:
        def __init__(self, val=0, left=None, right=None):
            self.val = val
            self.left = left
            self.right = right

${userSolution}

def _driver():
    try:
        sol = Solution()
        # DYNAMICALLY CALL THE FUNCTION
        # We use getattr to call the method by string name!
        method = getattr(sol, "${funcName}") 
        
        # Input handling: Try to evaluate the input string as Python literal
        # This handles cases like "[1,2,3], 4" or "1, 2"
        # We wrap it in parens to make it a tuple if it's multiple args
        input_str = """${input}"""
        
        # Safety: eval is risky but standard for local competitive programming runners
        # We assume input_str is valid Python expression for arguments
        if ',' in input_str and not input_str.strip().startswith('['):
             args = eval(f"({input_str})")
        else:
             args = eval(input_str)

        if isinstance(args, tuple):
            result = method(*args)
        else:
            result = method(args)
            
        # Print result formatted as JSON/String for comparison
        if result is None:
            print("null")
        elif isinstance(result, bool):
            print("true" if result else "false")
        else:
            print(result)
            
    except Exception as e:
        print(f"Runtime Error: {e}")

if __name__ == "__main__":
    _driver()
    `;
  }

  /**
   * Execute command with timeout
   */
  private async executeCommand(
    command: string,
    args: string[],
    input?: string,
    timeout: number = 10000
  ): Promise<ExecutionResult> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const process = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false
      });

      let output = '';
      let error = '';
      let timeoutId: NodeJS.Timeout;

      // Set timeout
      timeoutId = setTimeout(() => {
        process.kill();
        resolve({
          success: false,
          output,
          error: 'Execution timeout',
          exitCode: -1,
          executionTime: Date.now() - startTime
        });
      }, timeout);

      // Handle stdout
      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      // Handle stderr
      process.stderr.on('data', (data) => {
        error += data.toString();
      });

      // Handle process exit
      process.on('exit', (code) => {
        clearTimeout(timeoutId);
        resolve({
          success: code === 0 && error === '',
          output: output.trim(),
          error: error.trim(),
          exitCode: code || 0,
          executionTime: Date.now() - startTime
        });
      });

      // Send input if provided
      if (input) {
        process.stdin.write(input);
        process.stdin.end();
      }
    });
  }

  /**
   * Validate code syntax
   */
  async validateSyntax(code: string, language: 'python' | 'javascript'): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    if (language === 'python') {
      return this.validatePythonSyntax(code);
    } else {
      return this.validateJavaScriptSyntax(code);
    }
  }

  private async validatePythonSyntax(code: string): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    return new Promise((resolve) => {
      const fileId = uuidv4();
      const codeFile = path.join(this.tempDir, `${fileId}.py`);

      try {
        fs.writeFileSync(codeFile, code, 'utf-8');

        exec(`python3 -m py_compile "${codeFile}"`, (error, stdout, stderr) => {
          this.cleanupFile(codeFile);

          if (error) {
            resolve({
              valid: false,
              errors: [stderr || error.message]
            });
          } else {
            resolve({
              valid: true,
              errors: []
            });
          }
        });
      } catch (error) {
        this.cleanupFile(codeFile);
        resolve({
          valid: false,
          errors: [error instanceof Error ? error.message : String(error)]
        });
      }
    });
  }

  private async validateJavaScriptSyntax(code: string): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    return new Promise((resolve) => {
      const fileId = uuidv4();
      const codeFile = path.join(this.tempDir, `${fileId}.js`);

      try {
        fs.writeFileSync(codeFile, code, 'utf-8');

        exec(`node --check "${codeFile}"`, (error, stdout, stderr) => {
          this.cleanupFile(codeFile);

          if (error) {
            resolve({
              valid: false,
              errors: [stderr || error.message]
            });
          } else {
            resolve({
              valid: true,
              errors: []
            });
          }
        });
      } catch (error) {
        this.cleanupFile(codeFile);
        resolve({
          valid: false,
          errors: [error instanceof Error ? error.message : String(error)]
        });
      }
    });
  }

  /**
   * Format code
   */
  async formatCode(code: string, language: 'python' | 'javascript'): Promise<string> {
    // For Python, we could use black or autopep8
    // For JavaScript, we could use prettier
    // For now, return as-is (can be enhanced later)
    return code;
  }

  private cleanupFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`[CodeExecutor] Error cleaning up file ${filePath}:`, error);
    }
  }

  /**
   * Cleanup all temporary files
   */
  cleanup(): void {
    try {
      const files = fs.readdirSync(this.tempDir);
      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          console.error(`[CodeExecutor] Error deleting ${filePath}:`, error);
        }
      }
    } catch (error) {
      console.error('[CodeExecutor] Error during cleanup:', error);
    }
  }
}









