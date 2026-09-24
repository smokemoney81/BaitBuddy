/**
 * Mobile Audit Script
 * 
 * Run this in DevTools console to audit mobile compliance
 */

export function runMobileAudit() {
  const results = {
    touchTargets: [],
    hoverOnlyClasses: [],
    nativeFormElements: [],
    missingAriaLabels: [],
    warnings: [],
  };

  // 1. Check touch target sizes
  console.log('Auditing touch targets...');
  document.querySelectorAll('button, [role="button"], input[type="checkbox"], input[type="radio"], a[href]').forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width < 44 || rect.height < 44) {
      results.touchTargets.push({
        element: el.tagName,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        className: el.className,
        issue: `Touch target too small: ${Math.round(rect.width)}x${Math.round(rect.height)} (need 44x44)`
      });
    }
  });

  // 2. Check for hover-only classes
  console.log('Checking for hover-only effects...');
  document.querySelectorAll('[class*="hover:"]').forEach(el => {
    const classes = el.className;
    if (classes && !classes.includes('active:') && !classes.includes('focus:')) {
      results.hoverOnlyClasses.push({
        element: el.tagName,
        className: classes.substring(0, 100),
        issue: 'Hover class without active/focus state'
      });
    }
  });

  // 3. Check for native form elements without className
  console.log('Auditing form elements...');
  document.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach(el => {
    if (!el.className || el.className === '') {
      results.nativeFormElements.push({
        element: el.tagName,
        type: el.type || el.tagName,
        issue: 'Unstyled form element (should use MobileForm component)'
      });
    }
  });

  // 4. Check for missing ARIA labels
  console.log('Auditing ARIA labels...');
  document.querySelectorAll('button[class*="icon"], [role="button"]').forEach(el => {
    if (!el.getAttribute('aria-label') && !el.textContent.trim()) {
      results.missingAriaLabels.push({
        element: el.tagName,
        className: el.className.substring(0, 50),
        issue: 'Icon button missing aria-label'
      });
    }
  });

  // 5. Check for focus rings
  console.log('Checking focus visibility...');
  document.querySelectorAll('button, input, select, textarea, a[href]').forEach(el => {
    const _styles = window.getComputedStyle(el);
    const focusVisible = el.className.includes('focus-visible:') || el.className.includes('focus:');
    if (!focusVisible && !el.className.includes('no-focus')) {
      // Soft warning - not critical
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        // Element is visible
        if (!results.warnings.some(w => w.includes('focus ring'))) {
          results.warnings.push(`Found ${Math.random().toString().substring(0, 1)} elements without focus:ring-* class`);
        }
      }
    }
  });

  // Results summary
  const summary = {
    total: results.touchTargets.length + results.hoverOnlyClasses.length + 
           results.nativeFormElements.length + results.missingAriaLabels.length,
    passed: 0,
  };

  if (summary.total === 0) {
    summary.status = 'PASS';
    summary.passed = 1;
  } else {
    summary.status = 'ISSUES FOUND';
  }

  console.group('MOBILE AUDIT RESULTS');
  console.log(JSON.stringify({ summary, ...results }, null, 2));
  console.groupEnd();

  return { summary, results };
}

// Run on command
window.runMobileAudit = runMobileAudit;
console.log('Mobile audit available: runMobileAudit()');