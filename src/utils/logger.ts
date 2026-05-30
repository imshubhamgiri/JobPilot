import chalk from 'chalk';

// Log level type
type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'debug';

class Logger {
  private isDevelopment = process.env.NODE_ENV !== 'production';

  /**
   * Get formatted timestamp
   */
  private getTimestamp(): string {
    const now = new Date();
    return now.toLocaleTimeString('en-GB')?? '00:00:00';  // HH:MM:SS
  }

  /**
   * Log info message (blue)
   */
  info(message: string, data?: any): void {
    const timestamp = this.getTimestamp();
    console.log(
      chalk.blue(`[${timestamp}]`) + ' ' + chalk.blue('ℹ INFO') + ' ' + message,
      data || ''
    );
  }

    /** step message (magenta) */
  step(message: string): void {
    const timestamp = this.getTimestamp();
    console.log(
      chalk.blue(`[${timestamp}]`) + ' ' + chalk.magenta('↳ STEP') + ' ' + message
    );
  }

  /**
   * Log success message (green)
   */
  success(message: string, data?: any): void {
    const timestamp = this.getTimestamp();
    console.log(
      chalk.blue(`[${timestamp}]`) + ' ' + chalk.green('✓ SUCCESS') + ' ' + message,
      data || ''
    );
  }

  /**
   * Log warning message (yellow)
   */
  warn(message: string, data?: any): void {
    const timestamp = this.getTimestamp();
    console.warn(
      chalk.blue(`[${timestamp}]`) + ' ' + chalk.yellow('⚠ WARN') + ' ' + message,
      data || ''
    );
  }

  /**
   * Log error message (red)
   */
  error(message: string, error?: Error | any): void {
    const timestamp = this.getTimestamp();
    console.error(
      chalk.blue(`[${timestamp}]`) + ' ' + chalk.red('✗ ERROR') + ' ' + message
    );
    if (error) {
      if (error instanceof Error) {
        console.error(chalk.red(error.message));
        console.error(chalk.red(error.stack || ''));
      } else {
        console.error(chalk.red(JSON.stringify(error, null, 2)));
      }
    }
  }

  /**
   * Log debug message (cyan) - only in development
   */
  debug(message: string, data?: any): void {
    if (!this.isDevelopment) return;
    const timestamp = this.getTimestamp();
    console.log(
      chalk.blue(`[${timestamp}]`) + ' ' + chalk.cyan('🐛 DEBUG') + ' ' + message,
      data || ''
    );
  }

  /**
   * Log section header (useful for breaking up logs)
   */
  section(title: string): void {
    console.log('\n' + chalk.bold.cyan(`\n━━━ ${title} ━━━\n`));
  }

  /**
   * Log table-like data
   */
  table(data: any[]): void {
    console.table(data);
  }
}

// Export singleton instance
export default new Logger();
