document.addEventListener('DOMContentLoaded', function() {
  // Select team member wrappers instead of just images
  var teamMembers = document.querySelectorAll('.team-member');
  var modals = document.querySelectorAll('.modal');
  var closes = document.querySelectorAll('.close');

  // Add click event to entire team member wrapper
  teamMembers.forEach(function(member) {
    member.addEventListener('click', function(e) {
      // Find the associated image within the team member wrapper
      var image = member.querySelector('.team-image');
      if (image) {
        var modalId = image.getAttribute('data-modal');
        var modal = document.getElementById(modalId);
        if (modal) {
          modal.style.display = 'flex';
        }
      }
    });
  });

  // Close button handlers
  closes.forEach(function(closeBtn) {
    closeBtn.addEventListener('click', function(e) {
      e.stopPropagation(); // Prevent event from bubbling up
      closeBtn.closest('.modal').style.display = 'none';
    });
  });

  // Click outside modal to close
  window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
      event.target.style.display = 'none';
    }
  };
});