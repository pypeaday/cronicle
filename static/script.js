// Initialize Bootstrap toast
const toastEl = document.getElementById('toast');
const toast = new bootstrap.Toast(toastEl);

// Show notification
function showNotification(title, message, duration = 3000) {
    document.getElementById('toastTitle').textContent = title;
    document.getElementById('toastMessage').textContent = message;
    toast.show();
}

// Format duration
function formatDuration(seconds) {
    if (!seconds) return 'N/A';
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    seconds = (seconds % 60).toFixed(1);
    return `${minutes}m ${seconds}s`;
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
        
        const tbody = document.getElementById('jobsList');
        tbody.innerHTML = '';
        
        jobs.forEach(job => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${job.job_id}</td>
                <td>
                    ${job.schedule}
                    <div class="schedule-help">${cronstrue.toString(job.schedule)}</div>
                </td>
                <td>${job.tolerance_minutes} min</td>
                <td>${formatDateTime(job.last_start_time)}</td>
                <td class="duration-cell">${formatDuration(job.duration)}</td>
                <td>${job.last_alert ? 
                    `<span class="badge bg-warning" title="${job.last_alert_message}">
                        Alert: ${formatDateTime(job.last_alert)}
                    </span>` : 
                    'No alerts'}</td>
                <td class="client-info">
                    ${job.client ? `
                        <span class="badge bg-info" data-bs-toggle="tooltip" title="
                            IP: ${job.client.ip_address}
                            Host: ${job.client.hostname}
                            OS: ${job.client.os_info}
                            Agent: ${job.client.user_agent}
                        ">
                            ${job.client.ip_address}
                        </span>
                        <button class="btn btn-sm btn-link" onclick='showClientDetails(${JSON.stringify(job.client)})'>
                            Details
                        </button>
                    ` : 'No client info'}
                </td>
                <td class="job-actions">
                    <button class="btn btn-sm btn-primary" onclick="startJob('${job.job_id}')">Start</button>
                    <button class="btn btn-sm btn-secondary" onclick="endJob('${job.job_id}')">End</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        showNotification('Error', 'Failed to load jobs');
        console.error('Error loading jobs:', error);
    }
}

// Show client details in a modal
function showClientDetails(clientInfo) {
    const modalHtml = `
        <div class="modal fade" id="clientDetailsModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Client Details</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <dl class="row">
                            <dt class="col-sm-4">IP Address</dt>
                            <dd class="col-sm-8">${clientInfo.ip_address}</dd>
                            
                            <dt class="col-sm-4">Hostname</dt>
                            <dd class="col-sm-8">${clientInfo.hostname}</dd>
                            
                            <dt class="col-sm-4">OS Info</dt>
                            <dd class="col-sm-8">${clientInfo.os_info}</dd>
                            
                            <dt class="col-sm-4">User Agent</dt>
                            <dd class="col-sm-8">${clientInfo.user_agent}</dd>
                            
                            <dt class="col-sm-4">Python Version</dt>
                            <dd class="col-sm-8">${clientInfo.additional_info.python_version}</dd>
                            
                            <dt class="col-sm-4">Platform</dt>
                            <dd class="col-sm-8">${clientInfo.additional_info.platform}</dd>
                            
                            <dt class="col-sm-4">Timestamp</dt>
                            <dd class="col-sm-8">${formatDateTime(clientInfo.additional_info.timestamp)}</dd>
                        </dl>
                        <div class="mt-3">
                            <h6>Request Headers:</h6>
                            <pre class="bg-light p-2"><code>${JSON.stringify(clientInfo.additional_info.headers, null, 2)}</code></pre>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove any existing modal
    const existingModal = document.getElementById('clientDetailsModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Add the new modal to the document
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Show the modal
    const modal = new bootstrap.Modal(document.getElementById('clientDetailsModal'));
    modal.show();
}

// Add new job
document.getElementById('newJobForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const jobId = document.getElementById('jobId').value;
    const schedule = document.getElementById('schedule').value;
    const tolerance = parseInt(document.getElementById('tolerance').value);
    
    try {
        const response = await fetch('/configure_job', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                job_id: jobId,
                schedule: schedule,
                tolerance_minutes: tolerance
            }),
        });
        
        if (response.ok) {
            showNotification('Success', 'Job configured successfully');
            document.getElementById('newJobForm').reset();
            refreshJobs();
        } else {
            const error = await response.json();
            showNotification('Error', error.detail || 'Failed to configure job');
        }
    } catch (error) {
        showNotification('Error', 'Failed to configure job');
        console.error('Error configuring job:', error);
    }
});

// Start job
async function startJob(jobId) {
    try {
        const response = await fetch(`/start_job?job_id=${encodeURIComponent(jobId)}`, {
            method: 'POST',
        });
        const data = await response.json();
        
        if (response.ok) {
            showNotification('Success', 'Job started successfully');
            if (data.alert) {
                showNotification('Warning', data.alert);
            }
        } else {
            showNotification('Error', data.detail || 'Failed to start job');
        }
        refreshJobs();
    } catch (error) {
        showNotification('Error', 'Failed to start job');
        console.error('Error starting job:', error);
    }
}

// End job
async function endJob(jobId) {
    try {
        const response = await fetch(`/end_job?job_id=${encodeURIComponent(jobId)}`, {
            method: 'POST',
        });
        
        if (response.ok) {
            showNotification('Success', 'Job ended successfully');
        } else {
            const error = await response.json();
            showNotification('Error', error.detail || 'Failed to end job');
        }
        refreshJobs();
    } catch (error) {
        showNotification('Error', 'Failed to end job');
        console.error('Error ending job:', error);
    }
}

// Update schedule help text when schedule input changes
document.getElementById('schedule').addEventListener('input', function(e) {
    const scheduleHelp = document.getElementById('scheduleHelp');
    try {
        const explanation = cronstrue.toString(e.target.value);
        scheduleHelp.textContent = explanation;
        scheduleHelp.style.color = '#6c757d';
    } catch (error) {
        scheduleHelp.textContent = 'Invalid cron expression';
        scheduleHelp.style.color = '#dc3545';
    }
});

// Theme handling
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-bs-theme', savedTheme);
    document.getElementById('themeSwitch').checked = savedTheme === 'dark';
}

function toggleTheme(e) {
    const isDark = e.target.checked;
    const theme = isDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-bs-theme', theme);
    localStorage.setItem('theme', theme);
}

// Initialize theme
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    document.getElementById('themeSwitch').addEventListener('change', toggleTheme);
});

// Initial load
refreshJobs();
