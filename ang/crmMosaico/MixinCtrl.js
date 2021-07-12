(function(angular, $, _) {

  // This provides additional actions for editing a Mosaico mailing.
  // It coexists with crmMailing's EditMailingCtrl.
  angular.module('crmMosaico').controller('CrmMosaicoMixinCtrl', function CrmMosaicoMixinCtrl($scope, dialogService, crmMailingMgr, crmMosaicoTemplates, crmStatus, CrmMosaicoIframe, crmBlocker, $timeout, CrmAutosaveCtrl) {
    // var ts = $scope.ts = CRM.ts(null);

    // Main data is in $scope.mailing, $scope.mosaicoCtrl.template

    var crmMosaicoIframe = null, activeDialogs = {};
    var myAutosave = null;
    $scope.viewModel = null;
    var block = $scope.block = crmBlocker();

    // Hrm, would like `ng-controller="CrmMosaicoMixinCtrl as mosaicoCtrl`, but that's not working...
    $scope.mosaicoCtrl = {
      templates: [],
      // Fill a given "mailing" which the chosen "template".
      select: function(mailing, template) {
        var topt = mailing.template_options = mailing.template_options || {};
        var promise = crmMosaicoTemplates.getFull(template).then(function(tplCtnt){
          topt.mosaicoTemplate = template.id;
          topt.mosaicoMetadata = tplCtnt.metadata;
          topt.mosaicoContent = tplCtnt.content;
          mailing.body_html = tplCtnt.html;
          // console.log('select', {isAr1: _.isArray(mailing.template_options), isAr2: _.isArray(topt), m: mailing, t: template});
          $scope.mosaicoCtrl.edit(mailing);
        });
        return crmStatus({start: ts('Loading...'), success: null}, promise);
      },
      // Figure out which "template" was previously used with a "mailing."
      getTemplate: function(mailing) {
        if (!mailing || !mailing.template_options || !mailing.template_options.mosaicoTemplate) {
          return null;
        }
        var matches = _.where($scope.mosaicoCtrl.templates, {
          id: mailing.template_options.mosaicoTemplate
        });
        return matches.length > 0 ? matches[0] : null;
      },
      syncModel: function(mailing, viewModel) {
        mailing.body_html = viewModel.exportHTML();
        mailing.template_options = mailing.template_options || {};
        // Mosaico exports JSON. Keep their original encoding... or else the loader throws an error.
        mailing.template_options.mosaicoMetadata = viewModel.exportMetadata();
        mailing.template_options.mosaicoContent = viewModel.exportJSON();
      },
      // Reset all Mosaico data in a "mailing'.
      reset: function(mailing) {
        if (crmMosaicoIframe) crmMosaicoIframe.destroy();
        crmMosaicoIframe = null;
        delete mailing.template_options.mosaicoTemplate;
        delete mailing.template_options.mosaicoMetadata;
        delete mailing.template_options.mosaicoContent;
        mailing.body_html = '';
      },
      // Edit a mailing in Mosaico.
      edit: function(mailing) {
        if (crmMosaicoIframe) {
          crmMosaicoIframe.show();
          return;
        }

        function syncModel(viewModel) {
          $scope.viewModel = viewModel;
          $scope.mailing.body_html = viewModel.exportHTML();
          $scope.mailing.template_options = mailing.template_options || {};
          // Mosaico exports JSON. Keep their original encoding... or else the loader throws an error.
          $scope.mailing.template_options.mosaicoMetadata = viewModel.exportMetadata();
          $scope.mailing.template_options.mosaicoContent = viewModel.exportJSON();
          return $scope.save();
        }

        crmMosaicoIframe = new CrmMosaicoIframe({
          model: {
            template: $scope.mosaicoCtrl.getTemplate(mailing).path,
            metadata: mailing.template_options.mosaicoMetadata,
            content: mailing.template_options.mosaicoContent
          },
          actions: {
            close: function(ko, viewModel) {
              viewModel.metadata.changed = Date.now();
              syncModel(viewModel);
              // TODO: When autosave is better integrated, remove this.
              //$timeout(function(){$scope.save();}, 100);
              $timeout(myAutosave.save);
              crmMosaicoIframe.hide('crmMosaicoEditorDialog');
            },
            getmodel: function(ko, viewModel) {
              viewModel.metadata.changed = Date.now();
              syncModel(viewModel);
              return viewModel;
            },
            test: function(ko, viewModel) {
              syncModel(viewModel);

              var model = {mailing: $scope.mailing, attachments: $scope.attachments};
              var options = CRM.utils.adjustDialogDefaults(angular.extend(
                {autoOpen: false, title: ts('Preview / Test'), width: 550},
                options
              ));
              activeDialogs.crmMosaicoPreviewDialog = 1;
              var pr = dialogService.open('crmMosaicoPreviewDialog', '~/crmMosaico/PreviewDialogCtrl.html', model, options)
                .finally(function(){ delete activeDialogs.crmMosaicoPreviewDialog; });
              return pr;
            }
          }
        });

        return crmStatus({start: ts('Loading...'), success: null}, crmMosaicoIframe.open());
      }
    };
    
    // @return Promise
    $scope.save = function save() {
      return block(crmStatus(null,
        crmMailingMgr
          .save($scope.mailing)
          .then(function() {
            // pre-condition: the mailing exists *before* saving attachments to it
            return $scope.attachments.save();
          })
      ));
    };

    // Open a dialog of advanced options.
    $scope.openAdvancedOptions = function() {
      var model = {mailing: $scope.mailing, attachments: $scope.attachments};
      var options = CRM.utils.adjustDialogDefaults(angular.extend(
        {
          autoOpen: false,
          title: ts('Advanced Settings'),
          width: 600,
          height: 'auto'
        },
        options
      ));
      activeDialogs.crmMosaicoAdvancedDialog = 1;
      return dialogService.open('crmMosaicoAdvancedDialog', '~/crmMosaico/AdvancedDialogCtrl.html', model, options)
        .finally(function(){ delete activeDialogs.crmMosaicoAdvancedDialog; });
    };

    crmMosaicoTemplates.whenLoaded().then(function(){
      $scope.mosaicoCtrl.templates = crmMosaicoTemplates.getAll();
    });

    $scope.$on("$destroy", function() {
      angular.forEach(activeDialogs, function(v,name){
        dialogService.cancel(name);
      });
      if (crmMosaicoIframe) {
        crmMosaicoIframe.destroy();
        crmMosaicoIframe = null;
      }
      myAutosave.stop;
    });
    
    myAutosave = new CrmAutosaveCtrl({
        save: function() {
          return block(crmStatus({start: ts('Saving template...'), success: ts('Saved')}, $scope.save()));
        },
        saveIf: function() {
          return true;
        },
        model: function() {
          console.log(crmMosaicoIframe);
          return crmMosaicoIframe ? crmMosaicoIframe.actions.getmodel() : crmMosaicoIframe;
        },
        form: function() {
          return $scope.crmMailing;
        }
    });
    $timeout(myAutosave.start);
    $scope.$on('$destroy', myAutosave.stop);
  });

})(angular, CRM.$, CRM._);
