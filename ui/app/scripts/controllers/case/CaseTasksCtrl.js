(function() {
    'use strict';
    angular.module('theHiveControllers')
        .controller('CaseTaskDeleteCtrl', CaseTaskDeleteCtrl)
        .controller('CaseTasksCtrl', CaseTasksCtrl);

    function CaseTasksCtrl($scope, $state, $stateParams, $q, $uibModal, CaseTabsSrv, PSearchSrv, CaseTaskSrv, UserInfoSrv, NotificationSrv, CortexSrv, AppLayoutSrv) {

        CaseTabsSrv.activateTab($state.current.data.tab);

        $scope.caseId = $stateParams.caseId;
        $scope.state = {
            isNewTask: false,
            showGrouped: !!AppLayoutSrv.layout.groupTasks
        };
        $scope.newTask = {
            status: 'Waiting'
        };
        $scope.taskResponders = null;
        $scope.collapseOptions = {};

        $scope.tasks = PSearchSrv($scope.caseId, 'case_task', {
            scope: $scope,
            loadAll: true,
            baseFilter: {
                _and: [{
                    _parent: {
                        _type: 'case',
                        _query: {
                            '_id': $scope.caseId
                        }
                    }
                }, {
                    _not: {
                        'status': 'Cancel'
                    }
                }]
            },
            sort: ['-flag', '+order', '+startDate', '+title'],
            onUpdate: function() {
                $scope.buildTaskGroups($scope.tasks.values);
            },
            pageSize: 1000
        });

        $scope.toggleGroupedView = function() {
            $scope.state.showGrouped = !$scope.state.showGrouped;

            AppLayoutSrv.groupTasks($scope.state.showGrouped);
        };

        $scope.buildTaskGroups = function(tasks) {
            // Sort tasks by order
            var orderedTasks = _.sortBy(_.map(tasks, function(t) {
                return _.pick(t, 'group', 'order');
            }), 'order');
            var groups = [];

            // Get group names by keeping the group orders
            _.each(orderedTasks, function(task) {
                if(groups.indexOf(task.group) === -1) {
                    groups.push(task.group);
                }
            });

            var groupedTasks = [];
            _.each(groups, function(group) {
                groupedTasks.push({
                    group: group,
                    tasks: _.filter(tasks, function(t) {
                        return t.group === group;
                    })
                })
            });

            $scope.groups = groups;
            $scope.groupedTasks = groupedTasks;
        };

        $scope.showTask = function(task) {
            $state.go('app.case.tasks-item', {
                itemId: task.id
            });
        };

        $scope.updateField = function (fieldName, newValue, task) {
            var field = {};
            field[fieldName] = newValue;
            return CaseTaskSrv.update({
                taskId: task.id
            }, field, function () {}, function (response) {
                NotificationSrv.error('taskList', response.data, response.status);
            });
        };

        $scope.addTask = function() {
            CaseTaskSrv.save({
                'caseId': $scope.caseId,
                'flag': false
            }, $scope.newTask, function() {
                $scope.isNewTask = false;
                $scope.newTask.title = '';
                $scope.newTask.group = '';
            }, function(response) {
                NotificationSrv.error('taskList', response.data, response.status);
            });
        };

        $scope.removeTask = function(task) {

            var modalInstance = $uibModal.open({
                animation: true,
                templateUrl: 'views/partials/case/case.task.delete.html',
                controller: 'CaseTaskDeleteCtrl',
                controllerAs: 'vm',
                resolve: {
                    title: function() {
                        return task.title;
                    }
                }
            });

            modalInstance.result.then(function() {
                CaseTaskSrv.update({
                    'taskId': task.id
                }, {
                    status: 'Cancel'
                }, function() {
                    $scope.$emit('tasks:task-removed', task);
                }, function(response) {
                    NotificationSrv.error('taskList', response.data, response.status);
                });
            });

        };

        // open task tab with its details
        $scope.startTask = function(task) {
            if (task.status === 'Waiting') {
                $scope.updateTaskStatus(task.id, 'InProgress')
                    .then($scope.showTask);
            } else {
                $scope.showTask(task);
            }
        };

        $scope.openTask = function(task) {
            if (task.status === 'Completed') {
                $scope.updateTaskStatus(task.id, 'InProgress')
                    .then($scope.showTask);
            }
        };

        $scope.closeTask = function(task) {
            if (task.status === 'InProgress') {
                $scope.updateTaskStatus(task.id, 'Completed');
            }
        };

        $scope.updateTaskStatus = function(taskId, status) {
            var defer = $q.defer();

            CaseTaskSrv.update({
                'taskId': taskId
            }, {
                'status': status
            }, function(data) {
                defer.resolve(data);
            }, function(response) {
                NotificationSrv.error('taskList', response.data, response.status);
                defer.reject(response);
            });

            return defer.promise;
        };

        $scope.getTaskResponders = function(task, force) {
            if(!force && $scope.taskResponders !== null) {
               return;
            }

            $scope.taskResponders = null;
            CortexSrv.getResponders('case_task', task.id)
                .then(function(responders) {
                    $scope.taskResponders = responders;
                    return CortexSrv.promntForResponder(responders);
                })
                .then(function(response) {
                    if (response && _.isString(response)) {
                        NotificationSrv.log(response, 'warning');
                    } else {
                        return CortexSrv.runResponder(response.id, response.name, 'case_task', _.pick(task, 'id'));
                    }
                })
                .then(function(response) {
                    NotificationSrv.success(['Responder', response.data.responderName, 'started successfully on task', task.title].join(' '));
                })
                .catch(function(err) {
                    if (err && !_.isString(err)) {
                        NotificationSrv.error('taskList', err.data, err.status);
                    }
                });
        };    
    }

    function CaseTaskDeleteCtrl($uibModalInstance, title) {
        this.title = title;

        this.ok = function() {
            $uibModalInstance.close();
        };

        this.cancel = function() {
            $uibModalInstance.dismiss();
        };
    }
}());
