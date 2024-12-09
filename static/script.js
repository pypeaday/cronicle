// Initialize Bootstrap toast
const toastEl = document.getElementById('toast');
const toast = new bootstrap.Toast(toastEl);

// Show notification
function showToast(title, message, type = 'success') {
    const toastEl = document.getElementById('toast');
    const toastTitle = toastEl.querySelector('.toast-header strong');
    const toastBody = toastEl.querySelector('.toast-body');
    
    toastTitle.textContent = title;
    toastBody.textContent = typeof message === 'object' ? JSON.stringify(message) : message;
    
    toastEl.classList.remove('bg-success', 'bg-danger', 'bg-warning');
    toastEl.classList.add(type === 'error' ? 'bg-danger' : type === 'warning' ? 'bg-warning' : 'bg-success');
    
    const toast = new bootstrap.Toast(toastEl);
    toast.show();
}

// Format duration
function formatDuration(minutes) {
    if (minutes < 1) {
        const seconds = Math.round(minutes * 60);
        return `${seconds} sec`;
    } else if (minutes < 60) {
        return `${Math.round(minutes)} min`;
    } else {
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = Math.round(minutes % 60);
        return remainingMinutes > 0 ? 
            `${hours}h ${remainingMinutes}m` : 
            `${hours}h`;
    }
}

// Format datetime
function formatDateTime(isoString) {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    return date.toLocaleString();
}

// Refresh jobs list
async function refreshJobs() {
    try {
        const response = await fetch('/jobs');
        const jobs = await response.json();
        
        // Update jobs table
        const jobsList = document.getElementById('jobsList');
        const currentScrollPos = window.scrollY;
        jobsList.innerHTML = '';
        
        jobs.forEach(job => {
            const isHeartbeat = !job.max_runtime_minutes;
            
            // Add to jobs table
            const row = document.createElement('tr');
            row.className = job.paused ? 'text-muted' : '';
            row.innerHTML = `
                <td>${job.job_id}</td>
                <td>
                    ${job.schedule}
                    <div class="small text-muted">${cronstrue.toString(job.schedule)}</div>
                </td>
                <td class="text-center">${job.tolerance_minutes}</td>
                <td class="text-center">${isHeartbeat ? 'N/A' : job.max_runtime_minutes}</td>
                <td>
                    <div class="d-flex align-items-center gap-2">
                        <span class="badge ${isHeartbeat ? 'bg-secondary' : 'bg-primary'}">${isHeartbeat ? 'Heartbeat' : 'Timed Job'}</span>
                        ${job.paused ? '<span class="badge bg-warning">Paused</span>' : ''}
                        ${job.last_start_time && (!job.last_end_time || new Date(job.last_start_time) > new Date(job.last_end_time)) ? 
                            '<div class="spinner-border spinner-border-sm text-primary" role="status"><span class="visually-hidden">Running...</span></div>' : 
                            ''}
                    </div>
                </td>
                <td>
                    <div class="job-actions">
                        <button class="btn btn-sm btn-outline-${job.paused ? 'success' : 'warning'}" 
                                onclick="${job.paused ? 'resumeJob' : 'pauseJob'}('${job.job_id}', event)" 
                                title="${job.paused ? 'Resume' : 'Pause'} Monitoring">
                            <i class="bi bi-${job.paused ? 'play' : 'pause'}-fill"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-primary" 
                                onclick="startJob('${job.job_id}', event)" 
                                title="Start Job">
                            <i class="bi bi-play-circle"></i>
                        </button>
                        ${!isHeartbeat ? 
                            `<button class="btn btn-sm btn-outline-secondary" 
                                    onclick="endJob('${job.job_id}', event)" 
                                    title="End Job">
                                <i class="bi bi-stop-circle"></i>
                            </button>` : 
                            `<div class="btn btn-sm invisible" style="pointer-events: none;">
                                <i class="bi bi-stop-circle"></i>
                            </div>`}
                        <button class="btn btn-sm btn-outline-danger" 
                                onclick="deleteJob('${job.job_id}', event)" 
                                title="Delete Job">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            jobsList.appendChild(row);
        });
        
        // Restore scroll position
        window.scrollTo(0, currentScrollPos);
    } catch (error) {
        console.error('Error in refreshJobs:', error);
        showToast('Error', 'Failed to refresh jobs: ' + error.message, 'error');
    }
}

// Global state for runs pagination
let currentRunsPage = 1;
let totalRunsPages = 1;

async function refreshRuns() {
    try {
        const response = await fetch(`/job_runs?page=${currentRunsPage}`);
        const data = await response.json();
        
        const runsList = document.getElementById('runsList');
        runsList.innerHTML = '';
        
        // Update pagination info
        totalRunsPages = data.total_pages;
        document.getElementById('runsStartRange').textContent = ((data.page - 1) * data.per_page) + 1;
        document.getElementById('runsEndRange').textContent = Math.min(data.page * data.per_page, data.total);
        document.getElementById('totalRuns').textContent = data.total;
        
        // Get job configurations to determine job types
        const jobsResponse = await fetch('/jobs');
        const jobs = await jobsResponse.json();
        const jobConfigs = {};
        jobs.forEach(job => {
            jobConfigs[job.job_id] = job;
        });
        
        // Update table
        for (const run of data.runs) {
            const row = document.createElement('tr');
            const jobConfig = jobConfigs[run.job_id];
            const isHeartbeat = jobConfig && !jobConfig.max_runtime_minutes;
            
            // Job ID
            const jobIdCell = document.createElement('td');
            jobIdCell.textContent = run.job_id;
            row.appendChild(jobIdCell);
            
            // Start Time
            const startTimeCell = document.createElement('td');
            startTimeCell.textContent = run.start_time ? new Date(run.start_time).toLocaleString() : '-';
            row.appendChild(startTimeCell);
            
            // End Time
            const endTimeCell = document.createElement('td');
            if (isHeartbeat) {
                const badge = document.createElement('span');
                badge.className = 'badge bg-secondary';
                badge.textContent = 'Heartbeat';
                endTimeCell.appendChild(badge);
            } else {
                endTimeCell.textContent = run.end_time ? new Date(run.end_time).toLocaleString() : 'Running...';
            }
            row.appendChild(endTimeCell);
            
            // Duration
            const durationCell = document.createElement('td');
            if (isHeartbeat) {
                durationCell.innerHTML = '<em class="text-muted">N/A</em>';
            } else if (run.duration) {
                durationCell.textContent = formatDuration(run.duration);
            } else if (run.start_time && !run.end_time) {
                const currentDuration = (new Date() - new Date(run.start_time)) / (1000 * 60);
                durationCell.innerHTML = `<em>${formatDuration(currentDuration)} (Running)</em>`;
            } else {
                durationCell.textContent = '-';
            }
            row.appendChild(durationCell);
            
            // Client Info
            const clientInfoCell = document.createElement('td');
            if (run.client_info) {
                const viewButton = document.createElement('button');
                viewButton.className = 'btn btn-sm btn-outline-info';
                viewButton.innerHTML = '<i class="bi bi-info-circle"></i> View Details';
                viewButton.onclick = () => showClientInfo(run.client_info);
                clientInfoCell.appendChild(viewButton);
            } else {
                clientInfoCell.textContent = 'No info';
            }
            row.appendChild(clientInfoCell);
            
            runsList.appendChild(row);
        }
        
        // Update pagination buttons
        const prevButton = document.querySelector('button[onclick="previousRunsPage()"]');
        const nextButton = document.querySelector('button[onclick="nextRunsPage()"]');
        prevButton.disabled = currentRunsPage === 1;
        nextButton.disabled = currentRunsPage === totalRunsPages;
    } catch (error) {
        console.error('Error refreshing runs:', error);
        showToast('Error', 'Failed to refresh runs', 'error');
    }
}

function previousRunsPage() {
    if (currentRunsPage > 1) {
        currentRunsPage--;
        refreshRuns();
    }
}

function nextRunsPage() {
    if (currentRunsPage < totalRunsPages) {
        currentRunsPage++;
        refreshRuns();
    }
}

// Job Control Functions
async function startJob(jobId, event) {
    if (event) event.preventDefault();
    try {
        const response = await fetch(`/jobs/${jobId}/start`, {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error(`Failed to start job: ${response.statusText}`);
        }

        const data = await response.json();
        showToast('Success', `Started job ${jobId}`, 'success');
        
        if (data.alert) {
            showToast('Warning', data.alert, 'warning');
        }

        // Immediate refresh
        await Promise.all([
            refreshJobs(),
            refreshRuns()
        ]).catch(error => {
            console.error('Error refreshing after job start:', error);
        });

    } catch (error) {
        console.error('Error starting job:', error);
        showToast('Error', error.message, 'error');
    }
}

async function endJob(jobId, event) {
    if (event) event.preventDefault();
    try {
        const response = await fetch(`/jobs/${jobId}/end`, {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error(`Failed to end job: ${response.statusText}`);
        }

        showToast('Success', `Ended job ${jobId}`, 'success');
        
        // Immediate refresh
        await Promise.all([
            refreshJobs(),
            refreshRuns()
        ]).catch(error => {
            console.error('Error refreshing after job end:', error);
        });

    } catch (error) {
        console.error('Error ending job:', error);
        showToast('Error', error.message, 'error');
    }
}

async function pauseJob(jobId, event) {
    if (event) event.preventDefault();
    try {
        const response = await fetch(`/jobs/${jobId}/pause`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error(`Failed to pause job: ${response.status}`);
        }
        
        showToast('Success', `Paused monitoring for job ${jobId}`);
        
        // Immediate refresh
        await Promise.all([
            refreshJobs(),
            refreshRuns()
        ]).catch(error => {
            console.error('Error refreshing after job pause:', error);
        });
    } catch (error) {
        showToast('Error', `Failed to pause job: ${error.message}`, 'error');
    }
}

async function resumeJob(jobId, event) {
    if (event) event.preventDefault();
    try {
        const response = await fetch(`/jobs/${jobId}/resume`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            throw new Error(`Failed to resume job: ${response.status}`);
        }
        
        showToast('Success', `Resumed monitoring for job ${jobId}`);
        
        // Immediate refresh
        await Promise.all([
            refreshJobs(),
            refreshRuns()
        ]).catch(error => {
            console.error('Error refreshing after job resume:', error);
        });
    } catch (error) {
        showToast('Error', `Failed to resume job: ${error.message}`, 'error');
    }
}

// Delete job
async function deleteJob(jobId, event) {
    if (event) event.preventDefault();
    if (!confirm(`Are you sure you want to delete job ${jobId}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/jobs/${jobId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showToast('Success', `Job ${jobId} deleted successfully`);
            // Refresh all tables since delete affects everything
            await Promise.all([
                refreshJobs(),
                refreshRuns()
            ]);
        } else {
            const data = await response.json();
            showToast('Error', data.detail || 'Failed to delete job', 'error');
        }
    } catch (error) {
        showToast('Error', 'Failed to delete job', 'error');
        console.error('Error deleting job:', error);
    }
}

// Show client details in a modal
function showClientDetails(clientInfo) {
    if (!clientInfo) {
        showToast('Info', 'No client information available', 'info');
        return;
    }

    // Extract additional info from client metadata
    const additionalInfo = clientInfo.additional_info || {};
    
    const modalHtml = `
        <div class="list-group list-group-flush">
            <div class="list-group-item">
                <small class="text-muted">IP Address</small>
                <div>${clientInfo.ip_address || 'N/A'}</div>
            </div>
            <div class="list-group-item">
                <small class="text-muted">Hostname</small>
                <div>${clientInfo.hostname || 'N/A'}</div>
            </div>
            <div class="list-group-item">
                <small class="text-muted">OS Info</small>
                <div>${clientInfo.os_info || 'N/A'}</div>
            </div>
            <div class="list-group-item">
                <small class="text-muted">User Agent</small>
                <div>${clientInfo.user_agent || 'N/A'}</div>
            </div>
            ${Object.entries(additionalInfo)
                .map(([key, value]) => `
                    <div class="list-group-item">
                        <small class="text-muted">${key}</small>
                        <div>${typeof value === 'object' ? JSON.stringify(value, null, 2) : value}</div>
                    </div>
                `).join('')}
        </div>
    `;
    
    document.getElementById('clientDetailsModalBody').innerHTML = modalHtml;
    
    const modal = new bootstrap.Modal(document.getElementById('clientDetailsModal'));
    modal.show();
}

// Add or update job configuration
async function addJob(event) {
    event.preventDefault();
    const jobId = document.getElementById('jobId').value;
    const schedule = document.getElementById('schedule').value;
    const tolerance = parseInt(document.getElementById('tolerance').value);
    const maxRuntimeInput = document.getElementById('maxRuntime');
    const maxRuntime = maxRuntimeInput.value.trim() === '' ? null : parseInt(maxRuntimeInput.value);

    try {
        // First check if job already exists
        const response = await fetch('/jobs');
        const jobs = await response.json();
        const existingJob = jobs.find(job => job.job_id === jobId);
        
        if (existingJob) {
            const confirmOverwrite = confirm(`A job with ID "${jobId}" already exists. Do you want to update it?`);
            if (!confirmOverwrite) {
                return;
            }
        }

        const createResponse = await fetch('/jobs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                job_id: jobId,
                schedule: schedule,
                tolerance_minutes: tolerance,
                max_runtime_minutes: maxRuntime
            }),
        });

        if (!createResponse.ok) {
            const error = await createResponse.json();
            showToast('Error', error.detail || 'Failed to configure job', 'error');
            return;
        }

        showToast('Success', `Job ${existingJob ? 'updated' : 'created'} successfully`);
        document.getElementById('newJobForm').reset();
        // Refresh all relevant tables
        await Promise.all([
            refreshJobs(),
            refreshRuns()
        ]);
    } catch (error) {
        showToast('Error', 'Failed to configure job: ' + error.message, 'error');
    }
}

// Helper functions
function formatClientInfo(clientInfo) {
    if (!clientInfo) return '';
    
    try {
        const info = typeof clientInfo === 'string' ? JSON.parse(clientInfo) : clientInfo;
        return JSON.stringify(info, null, 2);
    } catch (error) {
        console.error('Error formatting client info:', error);
        return String(clientInfo);
    }
}

function showClientInfo(clientInfo) {
    const modal = new bootstrap.Modal(document.getElementById('clientInfoModal'));
    const content = document.getElementById('clientInfoContent');
    
    try {
        const formattedInfo = formatClientInfo(clientInfo);
        content.innerHTML = `<pre class="mb-0">${formattedInfo}</pre>`;
        content.classList.add('bg-light', 'p-3', 'rounded');
        
        // Add syntax highlighting if available
        if (window.hljs) {
            content.querySelector('pre').classList.add('json');
            hljs.highlightElement(content.querySelector('pre'));
        }
    } catch (error) {
        content.innerHTML = '<div class="alert alert-danger">Error displaying client info</div>';
    }
    
    modal.show();
}

// Update schedule help text when schedule input changes
document.getElementById('schedule').addEventListener('input', function(e) {
    const scheduleHint = document.getElementById('scheduleHint');
    try {
        const expression = e.target.value.trim();
        if (expression) {
            scheduleHint.textContent = cronstrue.toString(expression);
        } else {
            scheduleHint.textContent = '';
        }
    } catch (error) {
        scheduleHint.textContent = 'Invalid cron expression';
    }
});

// Theme handling
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-bs-theme', savedTheme);
    document.getElementById('themeSwitch').checked = savedTheme === 'dark';
    
    // Update navbar class based on theme
    const navbar = document.querySelector('.navbar');
    if (savedTheme === 'dark') {
        navbar.classList.remove('navbar-light', 'bg-light');
        navbar.classList.add('navbar-dark', 'bg-dark');
    } else {
        navbar.classList.remove('navbar-dark', 'bg-dark');
        navbar.classList.add('navbar-light', 'bg-light');
    }
}

function toggleTheme(e) {
    const isDark = e.target.checked;
    const theme = isDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-bs-theme', theme);
    localStorage.setItem('theme', theme);
    
    // Update navbar class
    const navbar = document.querySelector('.navbar');
    if (isDark) {
        navbar.classList.remove('navbar-light', 'bg-light');
        navbar.classList.add('navbar-dark', 'bg-dark');
    } else {
        navbar.classList.remove('navbar-dark', 'bg-dark');
        navbar.classList.add('navbar-light', 'bg-light');
    }
}

// Alerts functionality
async function refreshAlerts() {
    console.log('Refreshing alerts...'); // Debug log
    const showAcknowledged = document.getElementById('showAcknowledged')?.checked || false;
    
    try {
        const response = await fetch(`/job_alerts?include_acknowledged=${showAcknowledged}`);
        const alerts = await response.json();
        console.log('Received alerts:', alerts); // Debug log
        
        const alertsList = document.getElementById('alertsList');
        const noAlerts = document.getElementById('noAlerts');
        const alertsContainer = document.querySelector('.alerts-container');
        const showAcknowledgedCheckbox = document.getElementById('showAcknowledged');
        
        if (!alertsList || !noAlerts || !alertsContainer || !showAcknowledgedCheckbox) {
            console.error('Required alert elements not found');
            return;
        }
        
        // Clear existing alerts
        alertsList.innerHTML = '';
        
        let visibleAlerts = alerts;
        if (!showAcknowledgedCheckbox.checked) {
            visibleAlerts = alerts.filter(alert => !alert.acknowledged);
        }

        if (visibleAlerts.length === 0) {
            noAlerts.classList.remove('d-none');
            alertsList.classList.add('d-none');
        } else {
            noAlerts.classList.add('d-none');
            alertsList.classList.remove('d-none');
            
            visibleAlerts.forEach(alert => {
                const alertDiv = document.createElement('div');
                alertDiv.className = `alert-item ${alert.acknowledged ? 'acknowledged' : ''}`;
                alertDiv.innerHTML = `
                    <span class="badge ${getAlertTypeBadgeClass(alert.type)}">${formatAlertType(alert.type)}</span>
                    <span class="job-id">${alert.job_id}</span>
                    <div class="actions">
                        ${!alert.acknowledged ? 
                            `<button class="btn btn-sm btn-outline-secondary" onclick="acknowledgeAlert('${alert.id}')">
                                <i class="bi bi-check2"></i>
                            </button>` : ''
                        }
                        <button class="btn btn-sm btn-outline-info" onclick="toggleDetails('${alert.id}')">
                            <i class="bi bi-info-circle"></i>
                        </button>
                    </div>
                `;
                
                alertsList.appendChild(alertDiv);
                
                // Create details section
                const detailsDiv = document.createElement('div');
                detailsDiv.className = 'alert-details';
                detailsDiv.id = `details-${alert.id}`;
                detailsDiv.innerHTML = `
                    <p><strong>Time:</strong> ${new Date(alert.detected_time).toLocaleString()}</p>
                    <p><strong>Message:</strong> ${alert.alert_message}</p>
                    ${alert.acknowledged ? 
                        `<p><strong>Acknowledged:</strong> ${new Date(alert.created_at).toLocaleString()}</p>` : ''
                    }
                `;
                
                alertsList.appendChild(detailsDiv);
            });
        }

        // Add or remove has-unacknowledged class based on unacknowledged alerts
        const hasUnacknowledged = alerts.some(alert => !alert.acknowledged);
        alertsContainer.classList.toggle('has-unacknowledged', hasUnacknowledged);
    } catch (error) {
        console.error('Error fetching alerts:', error);
    }
}

function getAlertTypeBadgeClass(type) {
    switch (type.toLowerCase()) {
        case 'missed_job':
            return 'badge-missed-job';
        case 'long_running':
            return 'badge-long-running';
        default:
            return 'bg-secondary';
    }
}

function formatAlertType(type) {
    return type.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
}

function toggleDetails(alertId) {
    const details = document.getElementById(`details-${alertId}`);
    if (details) {
        details.classList.toggle('active');
    }
}

async function acknowledgeAlert(alertId) {
    try {
        const response = await fetch(`/acknowledge_alert/${alertId}`, { method: 'POST' });
        if (!response.ok) throw new Error('Failed to acknowledge alert');
        
        showToast('Success', 'Alert acknowledged');
        // Refresh the alerts list
        await refreshAlerts();
    } catch (error) {
        showToast('Error', 'Failed to acknowledge alert: ' + error.message, 'error');
    }
}

// Initialize alerts functionality
document.addEventListener('DOMContentLoaded', function() {
    // Initial alerts load
    refreshAlerts();
    
    // Set up collapse button
    const collapseButton = document.getElementById('collapseAlerts');
    if (collapseButton) {
        collapseButton.addEventListener('click', function() {
            const alertsSection = document.getElementById('alertsSection');
            alertsSection.classList.toggle('collapsed');
        });
    }
    
    // Set up show acknowledged checkbox
    const showAcknowledgedCheckbox = document.getElementById('showAcknowledged');
    if (showAcknowledgedCheckbox) {
        showAcknowledgedCheckbox.addEventListener('change', refreshAlerts);
    }
});

// Main initialization
document.addEventListener('DOMContentLoaded', async () => {
    initTheme();
    document.getElementById('themeSwitch').addEventListener('change', toggleTheme);
    
    // Initial load - with error handling
    try {
        await Promise.all([
            refreshJobs().catch(error => console.error('Initial jobs refresh failed:', error)),
            refreshRuns().catch(error => console.error('Initial runs refresh failed:', error)),
            refreshAlerts().catch(error => console.error('Initial alerts refresh failed:', error))
        ]);
    } catch (error) {
        console.error('Error during initial data load:', error);
    }
    
    // Add event listeners
    const newJobForm = document.getElementById('newJobForm');
    if (newJobForm) {
        newJobForm.addEventListener('submit', addJob);
    }
    
    // Set up periodic refresh
    setInterval(async () => {
        try {
            await Promise.all([
                refreshJobs(),
                refreshRuns()
            ]);
        } catch (error) {
            console.error('Error in periodic refresh:', error);
        }
    }, 5000); // Refresh every 5 seconds

    // Set up alerts refresh
    setInterval(async () => {
        try {
            await refreshAlerts();
        } catch (error) {
            console.error('Error refreshing alerts:', error);
        }
    }, 30000); // Refresh alerts every 30 seconds
});

// Set up WebSocket connection for real-time updates
const socket = new WebSocket('ws://' + window.location.host + '/ws');
socket.onmessage = function(event) {
    const data = JSON.parse(event.data);
    if (data.type === 'job_status' || data.type === 'job_update') {
        refreshJobs(); // Refresh jobs table when job status changes
    }
};

// Add event listener for collapse button
document.addEventListener('DOMContentLoaded', function() {
    const collapseButton = document.getElementById('collapseAlerts');
    if (collapseButton) {
        collapseButton.addEventListener('click', function() {
            const alertsSection = document.getElementById('alertsSection');
            alertsSection.classList.toggle('collapsed');
        });
    }
});

function setupAlertsCollapse() {
    const alertsSection = document.querySelector('.alerts-section');
    const collapseButton = document.querySelector('.collapse-button');
    
    if (!alertsSection || !collapseButton) {
        console.error('Could not find alerts section or collapse button');
        return;
    }

    // Set initial state based on localStorage
    const isCollapsed = localStorage.getItem('alertsCollapsed') === 'true';
    if (isCollapsed) {
        alertsSection.classList.add('collapsed');
    }

    collapseButton.addEventListener('click', () => {
        alertsSection.classList.toggle('collapsed');
        // Store state in localStorage
        localStorage.setItem('alertsCollapsed', alertsSection.classList.contains('collapsed'));
    });
}

// Call setupAlertsCollapse when document is ready
document.addEventListener('DOMContentLoaded', () => {
    setupAlertsCollapse();
    initTheme();
    document.getElementById('themeSwitch').addEventListener('change', toggleTheme);
    
    // Initial load - with error handling
    try {
        Promise.all([
            refreshJobs().catch(error => console.error('Initial jobs refresh failed:', error)),
            refreshRuns().catch(error => console.error('Initial runs refresh failed:', error))
        ]);
    } catch (error) {
        console.error('Error during initial data load:', error);
    }
    
    // Add event listeners
    const newJobForm = document.getElementById('newJobForm');
    if (newJobForm) {
        newJobForm.addEventListener('submit', addJob);
    }
    
    // Set up periodic refresh - each with its own error handling
    setInterval(async () => {
        try {
            await Promise.all([
                refreshJobs(),
                refreshRuns()
            ]);
        } catch (error) {
            console.error('Error in periodic refresh:', error);
        }
    }, 5000); // Refresh every 5 seconds
});
